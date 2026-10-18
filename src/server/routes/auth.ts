import { Hono } from 'hono';
import { loginSchema } from '../../shared/schemas.ts';
import { MINUTE } from '../../shared/time.ts';
import { verifyPassword } from '../auth/password.ts';
import { clearSessionCookie, requireRole, startSession } from '../auth/session.ts';
import { deleteExpiredSessions, deleteSession, getUser } from '../data/users.ts';
import { ApiError, readJson, type AppDeps, type AppEnv } from '../http.ts';

const MAX_FAILURES = 5;
const LOCKOUT = 15 * MINUTE;

export function authRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  // Failed logins per (existing) user, to slow down password guessing.
  const failures = new Map<string, { count: number; since: number }>();

  app.post('/login', async (c) => {
    const { username, password } = await readJson(c, loginSchema);
    const now = deps.clock();
    const user = getUser(deps.db, username);

    let failed = user ? failures.get(user.username) : undefined;
    if (failed && now - failed.since >= LOCKOUT) {
      failures.delete(username);
      failed = undefined;
    }
    if (failed && failed.count >= MAX_FAILURES) throw new ApiError(429, 'Troppi tentativi: riprova tra qualche minuto');

    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      if (user) failures.set(user.username, { count: (failed?.count ?? 0) + 1, since: failed?.since ?? now });
      throw new ApiError(401, 'Nome utente o password errati');
    }

    failures.delete(user.username);
    deleteExpiredSessions(deps.db, now);
    startSession(c, deps, user.username);
    return c.json({ username: user.username, role: user.role });
  });

  app.post('/logout', (c) => {
    const sessionHash = c.get('sessionHash');
    if (sessionHash) deleteSession(deps.db, sessionHash);
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  app.get('/me', requireRole('admin'), (c) => c.json(c.get('user')));

  return app;
}
