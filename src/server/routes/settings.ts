import { Hono } from 'hono';
import { settingsSchema } from '../../shared/schemas.ts';
import { requireRole } from '../auth/session.ts';
import sharp from 'sharp';
import { bodyLimit } from 'hono/body-limit';
import { getSettings, getVenueLogo, saveSettings, setVenueLogo } from '../data/settings.ts';
import { ApiError, notFound, readJson, type AppDeps, type AppEnv } from '../http.ts';

const MAX_VENUE_LOGO_BYTES = 1024 * 1024;

/** Checks an uploaded venue logo: a real SVG, without scripts. */
async function checkVenueLogo(file: File): Promise<string> {
  if (file.size > MAX_VENUE_LOGO_BYTES) throw new ApiError(413, 'Logo troppo grande (max 1 MB)');
  const svg = await file.text();
  let format: string | undefined;
  try {
    ({ format } = await sharp(Buffer.from(svg)).metadata());
  } catch {
    // handled below
  }
  if (format !== 'svg') throw new ApiError(400, 'Il file non è un SVG valido');
  if (/<script|<foreignObject|\son[a-z]+\s*=|javascript:/i.test(svg)) throw new ApiError(400, 'L’SVG contiene script: non è accettato');
  return svg;
}

/**
 * The venue logo in the sign's header (and the admin's). Public, since the sign shows it. Versioned
 * URLs are cached forever. A strict CSP means that even opened directly, an SVG can never run code.
 */
export function venueLogoRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  app.get('/', (c) => {
    const logo = getVenueLogo(deps.db);
    if (!logo) throw notFound();
    return c.body(logo.svg, 200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': c.req.query('v') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
  });
  app.put(
    '/',
    requireRole('superadmin'),
    bodyLimit({
      maxSize: MAX_VENUE_LOGO_BYTES + 64 * 1024,
      onError: () => {
        throw new ApiError(413, 'Logo troppo grande (max 1 MB)');
      },
    }),
    async (c) => {
      const file = (await c.req.parseBody())['file'];
      if (!(file instanceof File)) throw new ApiError(400, 'Nessun file ricevuto');
      setVenueLogo(deps.db, await checkVenueLogo(file));
      return c.json({ version: getVenueLogo(deps.db)!.version });
    },
  );
  app.delete('/', requireRole('superadmin'), (c) => {
    setVenueLogo(deps.db, null);
    return c.body(null, 204);
  });
  return app;
}

/** Sign settings: both accounts can read them (the admin preview uses them), only the superadmin changes them. */
export function settingsRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  app.use('*', requireRole('admin'));

  app.get('/', (c) => c.json(getSettings(deps.db)));

  app.put('/', requireRole('superadmin'), async (c) => {
    saveSettings(deps.db, await readJson(c, settingsSchema));
    return c.json(getSettings(deps.db));
  });

  return app;
}
