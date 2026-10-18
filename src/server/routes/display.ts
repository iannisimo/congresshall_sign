import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import type { DisplaySnapshot } from '../../shared/model.ts';
import { displayWindow } from '../../shared/time.ts';
import { listEvents } from '../data/events.ts';
import { listMedia } from '../data/media.ts';
import { activeOverrides } from '../data/overrides.ts';
import { listRooms } from '../data/rooms.ts';
import { getSettings, getVenueLogo } from '../data/settings.ts';
import type { AppDeps, AppEnv } from '../http.ts';

/**
 * The sign polls this every minute. The body only depends on the data and the current day, so its
 * hash works as an ETag and an unchanged snapshot costs a 304 with no body.
 */
export function displayRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.get('/display', (c) => {
    const now = deps.clock();
    const snapshot: DisplaySnapshot = {
      version: deps.version,
      settings: getSettings(deps.db),
      venueLogo: getVenueLogo(deps.db)?.version ?? null,
      media: listMedia(deps.db)
        .filter((m) => m.enabled)
        .map((m) => ({ id: m.id, kind: m.kind, fit: m.fit })),
      rooms: listRooms(deps.db),
      events: listEvents(deps.db, { ...displayWindow(now), visibleOnly: true }),
      overrides: activeOverrides(deps.db, now),
    };
    const body = JSON.stringify(snapshot);
    const etag = `"${createHash('sha1').update(body).digest('base64url')}"`;

    c.header('ETag', etag);
    c.header('Cache-Control', 'no-cache');
    // A compressing proxy may have weakened the ETag it passed on.
    const known = c.req.header('if-none-match')?.split(',').map((tag) => tag.trim().replace(/^W\//, ''));
    if (known?.includes(etag)) return c.body(null, 304);
    return c.body(body, 200, { 'Content-Type': 'application/json; charset=utf-8' });
  });

  return app;
}
