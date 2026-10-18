import { join } from 'node:path';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  /** Where the SQLite database lives. */
  DATA_DIR: z.string().min(1).default('./data'),
  /** The built web app (vite build output). */
  WEB_DIR: z.string().min(1).default('./dist/web'),
  SESSION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** Trust X-Forwarded-* headers from a reverse proxy. */
  TRUST_PROXY: z.stringbool().default(false),
  /** "auto": Secure cookies when the request came over HTTPS. */
  COOKIE_SECURE: z.enum(['auto', 'true', 'false']).default('auto'),
});

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  webDir: string;
  sessionDays: number;
  trustProxy: boolean;
  cookieSecure: 'auto' | 'true' | 'false';
}

export class ConfigError extends Error {}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // Empty variables (e.g. `PORT=` in a compose file) mean "use the default".
  const present = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  const result = schema.safeParse(present);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigError(`Invalid configuration:\n${lines.join('\n')}`);
  }
  const c = result.data;
  return {
    port: c.PORT,
    host: c.HOST,
    dataDir: c.DATA_DIR,
    webDir: c.WEB_DIR,
    sessionDays: c.SESSION_DAYS,
    trustProxy: c.TRUST_PROXY,
    cookieSecure: c.COOKIE_SECURE,
  };
}

export function databasePath(config: Config): string {
  return join(config.dataDir, 'congresshall.db');
}
