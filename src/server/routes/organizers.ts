import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { logoCropSchema, logoSourceSchema, organizerInputSchema, type LogoCrop } from '../../shared/schemas.ts';
import { requireRole } from '../auth/session.ts';
import {
  countLogoUses,
  createOrganizer,
  deleteLogo,
  deleteOrganizer,
  findOrganizerByName,
  getLogo,
  getOrganizer,
  insertLogo,
  listOrganizers,
  renameOrganizer,
} from '../data/organizers.ts';
import { ApiError, idParam, notFound, readJson, type AppDeps, type AppEnv } from '../http.ts';
import { fetchImage, GENERIC_LOGOS, MAX_UPLOAD_BYTES, normalizeLogo, readGenericLogo } from '../images.ts';

export function organizerRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const { db } = deps;
  app.use('*', requireRole('admin'));

  app.get('/', (c) => c.json(listOrganizers(db)));

  /** Returns the existing organizer when the name is already taken (ignoring case). */
  app.post('/', async (c) => {
    const { name } = await readJson(c, organizerInputSchema);
    const existing = findOrganizerByName(db, name);
    if (existing) return c.json(existing, 200);
    return c.json(getOrganizer(db, createOrganizer(db, name)), 201);
  });

  app.patch('/:id', async (c) => {
    const id = idParam(c);
    const { name } = await readJson(c, organizerInputSchema);
    if (!getOrganizer(db, id)) throw notFound();
    const clash = findOrganizerByName(db, name);
    if (clash && clash.id !== id) throw new ApiError(409, 'Esiste già un organizzatore con questo nome');
    renameOrganizer(db, id, name);
    return c.json(getOrganizer(db, id));
  });

  app.delete('/:id', (c) => {
    const organizer = getOrganizer(db, idParam(c));
    if (!organizer) throw notFound();
    if (organizer.eventCount > 0) {
      throw new ApiError(409, `Non eliminabile: usato da ${organizer.eventCount} eventi`);
    }
    deleteOrganizer(db, organizer.id);
    return c.body(null, 204);
  });

  /** Multipart `file`, JSON `{ url }` that the server downloads, or `{ generic }` to copy an emblem. */
  app.post(
    '/:id/logos',
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
      onError: () => {
        throw new ApiError(413, 'Immagine troppo grande (max 10 MB)');
      },
    }),
    async (c) => {
      const organizerId = idParam(c);
      if (!getOrganizer(db, organizerId)) throw notFound();

      let input: Uint8Array;
      let crop: LogoCrop | undefined;
      if (c.req.header('content-type')?.startsWith('multipart/form-data')) {
        const body = await c.req.parseBody();
        const file = body['file'];
        if (!(file instanceof File)) throw new ApiError(400, 'Nessun file ricevuto');
        input = new Uint8Array(await file.arrayBuffer());
        if (typeof body['crop'] === 'string') {
          const parsed = logoCropSchema.safeParse(
            (() => {
              try {
                return JSON.parse(body['crop'] as string);
              } catch {
                return null;
              }
            })(),
          );
          if (!parsed.success) throw new ApiError(400, 'Ritaglio non valido');
          crop = parsed.data;
        }
      } else {
        const source = await readJson(c, logoSourceSchema);
        if ('url' in source) {
          input = await fetchImage(source.url);
          crop = source.crop;
        }
        else {
          const emblem = readGenericLogo(source.generic);
          if (!emblem) throw new ApiError(400, 'Logo generico inesistente');
          input = emblem;
        }
      }

      const logo = await normalizeLogo(input, crop);
      const id = insertLogo(db, { organizerId, ...logo }, deps.clock());
      return c.json({ id }, 201);
    },
  );

  return app;
}

/** The generic emblems: listed for the logo picker, and served as SVG for its previews. */
export function genericLogoRoutes() {
  const app = new Hono<AppEnv>();
  app.use('*', requireRole('admin'));
  app.get('/', (c) => c.json(GENERIC_LOGOS));
  app.get('/:id', (c) => {
    const svg = readGenericLogo(c.req.param('id'));
    if (!svg) throw notFound();
    return c.body(new Uint8Array(svg), 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=86400' });
  });
  return app;
}

export function logoRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const { db } = deps;

  // Public: the sign shows logos. A logo never changes once uploaded, so it can be cached forever.
  app.get('/:id', (c) => {
    const logo = getLogo(db, idParam(c));
    if (!logo) throw notFound();
    return c.body(new Uint8Array(logo.data), 200, {
      'Content-Type': logo.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
  });

  app.delete('/:id', requireRole('admin'), (c) => {
    const id = idParam(c);
    const uses = countLogoUses(db, id);
    if (uses > 0) throw new ApiError(409, `Non eliminabile: usato da ${uses} eventi`);
    if (!deleteLogo(db, id)) throw notFound();
    return c.body(null, 204);
  });

  return app;
}
