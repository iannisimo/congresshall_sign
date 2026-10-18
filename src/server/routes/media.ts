import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Hono } from 'hono';
import sharp from 'sharp';
import type { MediaKind } from '../../shared/model.ts';
import { mediaOrderSchema, mediaPatchSchema } from '../../shared/schemas.ts';
import { requireRole } from '../auth/session.ts';
import { deleteMedia, getMedia, insertMedia, listMedia, reorderMedia, updateMedia } from '../data/media.ts';
import { ApiError, idParam, notFound, readJson, type AppDeps, type AppEnv } from '../http.ts';

const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
/** Images are shrunk to fit a Full HD screen. */
const IMAGE_BOX = { width: 1920, height: 1080 };
const VIDEO_TYPES: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm' };

class TooLarge extends Error {}

/** Writes the request body to `path`, stopping at `limit` bytes. */
async function saveBody(body: ReadableStream<Uint8Array>, path: string, limit: number): Promise<number> {
  let size = 0;
  const counter = async function* (source: AsyncIterable<Uint8Array>) {
    for await (const chunk of source) {
      size += chunk.byteLength;
      if (size > limit) throw new TooLarge();
      yield chunk;
    }
  };
  await pipeline(Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]), counter, createWriteStream(path));
  return size;
}

/** MP4 files have "ftyp" at byte 4, WebM files start with the EBML magic number. */
async function looksLikeVideo(path: string, extension: string): Promise<boolean> {
  const file = await open(path, 'r');
  try {
    const { buffer } = await file.read(Buffer.alloc(12), 0, 12, 0);
    if (extension === 'mp4') return buffer.subarray(4, 8).toString('latin1') === 'ftyp';
    return buffer.readUInt32BE(0) === 0x1a45dfa3;
  } finally {
    await file.close();
  }
}

/**
 * Images and videos for the carousel the sign shows when no event is planned. Files live in
 * DATA_DIR/media under random names; they never change, so they can be cached forever.
 */
export function mediaRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const { db } = deps;
  const dir = join(deps.config.dataDir, 'media');

  app.get('/', requireRole('superadmin', 'media'), (c) => c.json(listMedia(db).map(({ file: _file, ...item }) => item)));

  // Public: the sign plays these. Supports Range requests, which video players rely on.
  app.get('/:id', async (c) => {
    const media = getMedia(db, idParam(c));
    if (!media) throw notFound();
    const path = join(dir, media.file);
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      throw notFound();
    }
    const headers: Record<string, string> = {
      'Content-Type': media.mime,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
    };
    const range = /^bytes=(\d*)-(\d*)$/.exec(c.req.header('range') ?? '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) {
        return c.body(null, 416, { 'Content-Range': `bytes */${size}` });
      }
      const stream = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
      return c.body(stream, 206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) });
    }
    return c.body(Readable.toWeb(createReadStream(path)) as ReadableStream, 200, { ...headers, 'Content-Length': String(size) });
  });

  /** The raw file as the body, its type in Content-Type and its name in X-File-Name (URI-encoded). */
  app.post('/', requireRole('superadmin', 'media'), async (c) => {
    const type = (c.req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    const kind: MediaKind | null = type.startsWith('image/') ? 'image' : VIDEO_TYPES[type] ? 'video' : null;
    if (!kind) throw new ApiError(400, 'Formato non supportato: immagini, o video MP4 (H.264) e WebM');
    if (!c.req.raw.body) throw new ApiError(400, 'Nessun file ricevuto');
    const name = decodeURIComponent(c.req.header('x-file-name') ?? '').slice(0, 200) || (kind === 'image' ? 'Immagine' : 'Video');

    await mkdir(dir, { recursive: true });
    const upload = join(dir, `upload-${randomUUID()}`);
    try {
      let size: number;
      try {
        size = await saveBody(c.req.raw.body, upload, kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES);
      } catch (error) {
        if (error instanceof TooLarge) {
          throw new ApiError(413, kind === 'image' ? 'Immagine troppo grande (max 30 MB)' : 'Video troppo grande (max 500 MB)');
        }
        throw error;
      }

      let file: string;
      let mime: string;
      if (kind === 'image') {
        // Shrink to the screen size and drop what browsers may not show (HEIC, TIFF…).
        let output: { data: Buffer; info: { size: number } };
        let alpha = false;
        try {
          alpha = !!(await sharp(upload).metadata()).hasAlpha;
          const image = sharp(upload, { limitInputPixels: 100_000_000 })
            .rotate()
            .resize({ ...IMAGE_BOX, fit: 'inside', withoutEnlargement: true });
          output = await (alpha ? image.png() : image.jpeg({ quality: 85, mozjpeg: true })).toBuffer({ resolveWithObject: true });
        } catch {
          throw new ApiError(400, 'Il file non è un’immagine valida');
        }
        mime = alpha ? 'image/png' : 'image/jpeg';
        file = `${randomUUID()}.${alpha ? 'png' : 'jpg'}`;
        await writeFile(join(dir, file), output.data);
        size = output.info.size;
      } else {
        const extension = VIDEO_TYPES[type]!;
        if (!(await looksLikeVideo(upload, extension))) throw new ApiError(400, 'Il file non è un video MP4 o WebM valido');
        mime = type;
        file = `${randomUUID()}.${extension}`;
        await rename(upload, join(dir, file));
      }

      const id = insertMedia(db, { kind, name, mime, file, size }, deps.clock());
      const { file: _file, ...item } = getMedia(db, id)!;
      return c.json(item, 201);
    } finally {
      await rm(upload, { force: true });
    }
  });

  app.put('/order', requireRole('superadmin', 'media'), async (c) => {
    const { ids } = await readJson(c, mediaOrderSchema);
    const existing = listMedia(db).map((m) => m.id);
    if (ids.length !== existing.length || !existing.every((id) => ids.includes(id))) {
      throw new ApiError(400, 'L’ordine deve contenere tutti i file');
    }
    reorderMedia(db, ids);
    return c.json(listMedia(db).map(({ file: _file, ...item }) => item));
  });

  /** Switch an item on or off, or set its own fit (null: the global one). */
  app.patch('/:id', requireRole('superadmin', 'media'), async (c) => {
    const id = idParam(c);
    const patch = await readJson(c, mediaPatchSchema);
    if (!getMedia(db, id)) throw notFound();
    updateMedia(db, id, patch);
    const { file: _file, ...item } = getMedia(db, id)!;
    return c.json(item);
  });

  app.delete('/:id', requireRole('superadmin', 'media'), async (c) => {
    const media = getMedia(db, idParam(c));
    if (!media) throw notFound();
    deleteMedia(db, media.id);
    await rm(join(dir, media.file), { force: true });
    return c.body(null, 204);
  });

  return app;
}
