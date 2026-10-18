import { Hono } from 'hono';
import { settingsSchema } from '../../shared/schemas.ts';
import { requireRole } from '../auth/session.ts';
import { getSettings, saveSettings } from '../data/settings.ts';
import { readJson, type AppDeps, type AppEnv } from '../http.ts';

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
