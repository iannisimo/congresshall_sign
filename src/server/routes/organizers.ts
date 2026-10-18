import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { logoUrlSchema, organizerInputSchema } from '../../shared/schemas.ts';
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
import { fetchImage, MAX_UPLOAD_BYTES, normalizeLogo } from '../images.ts';

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

  /** Multipart `file`, or JSON `{ url }` that the server downloads. */
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
      if (c.req.header('content-type')?.startsWith('multipart/form-data')) {
        const file = (await c.req.parseBody())['file'];
        if (!(file instanceof File)) throw new ApiError(400, 'Nessun file ricevuto');
        input = new Uint8Array(await file.arrayBuffer());
      } else {
        input = await fetchImage((await readJson(c, logoUrlSchema)).url);
      }

      const logo = await normalizeLogo(input);
      const id = insertLogo(db, { organizerId, ...logo }, deps.clock());
      return c.json({ id }, 201);
    },
  );

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
