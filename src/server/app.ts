import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { loadSession } from './auth/session.ts';
import { ApiError, requestHost, type AppDeps, type AppEnv } from './http.ts';
import { authRoutes } from './routes/auth.ts';
import { displayRoutes } from './routes/display.ts';
import { eventRoutes } from './routes/events.ts';
import { genericLogoRoutes, logoRoutes, organizerRoutes } from './routes/organizers.ts';
import { mediaPresetRoutes, mediaRoutes } from './routes/media.ts';
import { roomRoutes } from './routes/rooms.ts';
import { settingsRoutes, venueLogoRoutes } from './routes/settings.ts';
import { webRoutes } from './web.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Rejects changes sent by pages on other sites. Browsers always send Origin on these requests;
 * the session cookie is also SameSite=Strict, so this is a second line of defence.
 */
function sameOrigin(deps: AppDeps) {
  return createMiddleware(async (c, next) => {
    const origin = c.req.header('origin');
    if (!SAFE_METHODS.has(c.req.method) && origin) {
      let host: string | undefined;
      try {
        host = new URL(origin).host;
      } catch {
        // An unparsable Origin never matches.
      }
      if (host !== requestHost(c, deps.config)) throw new ApiError(403, 'Origine della richiesta non consentita');
    }
    await next();
  });
}

const jsonLimit = bodyLimit({
  maxSize: 1024 * 1024,
  onError: () => {
    throw new ApiError(413, 'Richiesta troppo grande');
  },
});

export function createApp(deps: AppDeps, options: { serveWeb?: boolean } = {}) {
  const app = new Hono<AppEnv>();

  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json({ error: error.message, ...error.extra }, error.status);
    if (error instanceof HTTPException) return error.getResponse();
    console.error(error);
    return c.json({ error: 'Errore interno del server' }, 500);
  });

  app.use('/api/*', sameOrigin(deps));
  // Uploads have their own, larger limits.
  app.use('/api/*', (c, next) =>
    /^\/api\/(organizers\/\d+\/logos|venue-logo)$/.test(c.req.path) || (c.req.method === 'POST' && c.req.path === '/api/media')
      ? next()
      : jsonLimit(c, next),
  );
  app.use('/api/*', loadSession(deps));

  app.get('/api/health', (c) => c.json({ ok: true, version: deps.version }));
  app.route('/api', displayRoutes(deps));
  app.route('/api/auth', authRoutes(deps));
  app.route('/api/events', eventRoutes(deps));
  app.route('/api/organizers', organizerRoutes(deps));
  app.route('/api/logos', logoRoutes(deps));
  app.route('/api/generic-logos', genericLogoRoutes());
  app.route('/api/rooms', roomRoutes(deps));
  app.route('/api/settings', settingsRoutes(deps));
  app.route('/api/venue-logo', venueLogoRoutes(deps));
  app.route('/api/media', mediaRoutes(deps));
  app.route('/api/media-presets', mediaPresetRoutes(deps));
  app.all('/api/*', (c) => c.json({ error: 'Non trovato' }, 404));

  if (options.serveWeb) app.route('/', webRoutes(deps.config.webDir));
  return app;
}
