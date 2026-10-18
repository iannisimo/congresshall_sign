import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';
import type { SessionUser } from '../shared/model.ts';
import type { Config } from './config.ts';
import type { Db } from './db/database.ts';

export interface AppDeps {
  db: Db;
  config: Config;
  /** Build id of the web app, sent to the sign so it can reload itself after an update. */
  version: string;
  clock: () => number;
}

export type AppEnv = {
  Variables: {
    user: SessionUser | undefined;
    sessionHash: string | undefined;
  };
};

/** Error with a JSON body `{ error, ...extra }`; messages are shown in the admin area, so Italian. */
export class ApiError extends Error {
  readonly status: ContentfulStatusCode;
  readonly extra: Record<string, unknown>;

  constructor(status: ContentfulStatusCode, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const notFound = () => new ApiError(404, 'Non trovato');

export function zodIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new ApiError(400, 'Dati non validi', { issues: zodIssues(result.error) });
  return result.data;
}

export async function readJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let data: unknown;
  try {
    data = await c.req.json();
  } catch {
    throw new ApiError(400, 'Richiesta non valida');
  }
  return parse(schema, data);
}

export function idParam(c: Context, name = 'id'): number {
  const id = Number(c.req.param(name));
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound();
  return id;
}

/** True when the browser reached us over HTTPS, directly or through a trusted proxy. */
export function isHttps(c: Context, config: Config): boolean {
  if (new URL(c.req.url).protocol === 'https:') return true;
  return config.trustProxy && c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() === 'https';
}

/** Host the browser used, as seen through a trusted proxy. */
export function requestHost(c: Context, config: Config): string | undefined {
  const forwarded = config.trustProxy ? c.req.header('x-forwarded-host')?.split(',')[0]?.trim() : undefined;
  return forwarded || c.req.header('host') || new URL(c.req.url).host;
}
