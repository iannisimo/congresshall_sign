import { Hono } from 'hono';
import { signSettingsSchema } from '../../shared/schemas.ts';
import { requireRole } from '../auth/session.ts';
import { getSignSettings, saveSignSettings } from '../data/settings.ts';
import { readJson, type AppDeps, type AppEnv } from '../http.ts';

/** Sign settings: both accounts can read them (the admin preview uses them), only the superadmin changes them. */
export function settingsRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  app.use('*', requireRole('admin'));

  app.get('/', (c) => c.json(getSignSettings(deps.db)));

  app.put('/', requireRole('superadmin'), async (c) => {
    saveSignSettings(deps.db, await readJson(c, signSettingsSchema));
    return c.json(getSignSettings(deps.db));
  });

  return app;
}
