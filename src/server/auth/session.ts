import { createHash, randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { Role } from '../../shared/model.ts';
import { DAY } from '../../shared/time.ts';
import { createSession, extendSession, findSession } from '../data/users.ts';
import { ApiError, isHttps, type AppDeps, type AppEnv } from '../http.ts';

const COOKIE = 'cs_session';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

function writeCookie(c: Context, deps: AppDeps, token: string): void {
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: 'Strict',
    path: '/',
    secure: deps.config.cookieSecure === 'auto' ? isHttps(c, deps.config) : deps.config.cookieSecure === 'true',
    maxAge: deps.config.sessionDays * (DAY / 1000),
  });
}

export function startSession(c: Context, deps: AppDeps, username: string): void {
  const token = randomBytes(32).toString('base64url');
  const now = deps.clock();
  createSession(deps.db, hashToken(token), username, now, now + deps.config.sessionDays * DAY);
  writeCookie(c, deps, token);
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, COOKIE, { path: '/' });
}

/**
 * Loads the session, if any, into `c.var.user`. Sessions slide: while in use they are renewed,
 * at most once a day, so the admin is only logged out after `sessionDays` without visits.
 */
export function loadSession(deps: AppDeps) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = getCookie(c, COOKIE);
    if (token) {
      const tokenHash = hashToken(token);
      const now = deps.clock();
      const session = findSession(deps.db, tokenHash, now);
      if (session) {
        c.set('user', session.user);
        c.set('sessionHash', tokenHash);
        const fullLength = deps.config.sessionDays * DAY;
        if (session.expiresAt - now < fullLength - DAY) {
          extendSession(deps.db, tokenHash, now + fullLength);
          writeCookie(c, deps, token);
        }
      }
    }
    await next();
  });
}

/** Lets in only the accounts with one of these roles. */
export function requireRole(...roles: Role[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user');
    if (!user) throw new ApiError(401, 'Accesso richiesto');
    if (!roles.includes(user.role)) throw new ApiError(403, 'Questo account non può farlo');
    await next();
  });
}
