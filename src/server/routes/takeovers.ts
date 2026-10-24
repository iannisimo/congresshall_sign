import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import sharp from 'sharp';
import { takeoverSchema } from '../../shared/schemas.ts';
import { MAX_IMAGE_BYTES } from '../../shared/settings.ts';
import { requireRole } from '../auth/session.ts';
import {
  deleteTakeover,
  getTakeover,
  insertTakeover,
  listTakeovers,
  purgeExpiredTakeovers,
  updateTakeover,
  type StoredTakeover,
} from '../data/takeovers.ts';
import { ApiError, idParam, notFound, parse, readJson, type AppDeps, type AppEnv } from '../http.ts';

/** Same box as the carousel images. */
const IMAGE_BOX = { width: 1920, height: 1080 };

export const takeoverDir = (dataDir: string) => join(dataDir, 'takeovers');

/** The public part of a takeover: no file name or mime. */
function publicTakeover({ file: _file, mime: _mime, ...takeover }: StoredTakeover) {
  return takeover;
}

/**
 * Still images that replace the sign between two times. Ephemeral: once `endAt` has passed, the row and the
 * file are deleted (by the timer in index.ts, and by every list or snapshot request, so nothing outlives its time).
 */
export function takeoverRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const { db } = deps;
  const dir = takeoverDir(deps.config.dataDir);

  // Public: the sign shows it. Only exists while the takeover hasn't ended.
  app.get('/:id/image', async (c) => {
    await purgeExpiredTakeovers(db, dir, deps.clock());
    const takeover = getTakeover(db, idParam(c));
    if (!takeover) throw notFound();
    let data: Buffer;
    try {
      data = await readFile(join(dir, takeover.file));
    } catch {
      throw notFound();
    }
    // The id is never reused, so the file can be cached; the sign's cache copy is what keeps it working offline.
    return c.body(new Uint8Array(data), 200, { 'Content-Type': takeover.mime, 'Cache-Control': 'public, max-age=3600' });
  });

  app.use('*', requireRole('admin', 'superadmin'));

  app.get('/', async (c) => {
    await purgeExpiredTakeovers(db, dir, deps.clock());
    return c.json(listTakeovers(db, deps.clock()).map(publicTakeover));
  });

  // Multipart: `file` plus `data`, the JSON of takeoverSchema.
  app.post(
    '/',
    bodyLimit({
      maxSize: MAX_IMAGE_BYTES + 64 * 1024,
      onError: () => {
        throw new ApiError(413, 'Immagine troppo grande (max 30 MB)');
      },
    }),
    async (c) => {
      const body = await c.req.parseBody();
      const file = body['file'];
      if (!(file instanceof File)) throw new ApiError(400, 'Nessun file ricevuto');
      let raw: unknown;
      try {
        raw = JSON.parse(String(body['data']));
      } catch {
        throw new ApiError(400, 'Richiesta non valida');
      }
      const data = parse(takeoverSchema, raw);
      const now = deps.clock();
      if (data.endAt <= now) throw new ApiError(400, 'La fine è già passata', { issues: [{ path: 'endAt', message: 'La fine è già passata' }] });

      // Shrink to the screen size and drop what browsers may not show (HEIC, TIFF…), as for the carousel.
      let output: Buffer;
      let alpha: boolean;
      try {
        const input = Buffer.from(await file.arrayBuffer());
        alpha = !!(await sharp(input).metadata()).hasAlpha;
        const image = sharp(input, { limitInputPixels: 100_000_000 }).rotate().resize({ ...IMAGE_BOX, fit: 'inside', withoutEnlargement: true });
        output = await (alpha ? image.png() : image.jpeg({ quality: 88, mozjpeg: true })).toBuffer();
      } catch {
        throw new ApiError(400, 'Il file non è un’immagine valida');
      }
      const name = `${randomUUID()}.${alpha ? 'png' : 'jpg'}`;
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, name), output);
      const id = insertTakeover(db, { ...data, mime: alpha ? 'image/png' : 'image/jpeg', file: name, size: output.length }, now);
      return c.json(publicTakeover(getTakeover(db, id)!), 201);
    },
  );

  // Times and look only; to change the image, delete and upload again.
  app.put('/:id', async (c) => {
    await purgeExpiredTakeovers(db, dir, deps.clock());
    const takeover = getTakeover(db, idParam(c));
    if (!takeover) throw notFound();
    const data = await readJson(c, takeoverSchema);
    updateTakeover(db, takeover.id, data);
    return c.json(publicTakeover(getTakeover(db, takeover.id)!));
  });

  app.delete('/:id', async (c) => {
    const takeover = getTakeover(db, idParam(c));
    if (!takeover) throw notFound();
    deleteTakeover(db, takeover.id);
    await rm(join(dir, takeover.file), { force: true });
    return c.body(null, 204);
  });

  return app;
}
