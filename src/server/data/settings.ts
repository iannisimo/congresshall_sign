import { createHash } from 'node:crypto';
import type { Settings } from '../../shared/model.ts';
import { settingsSchema } from '../../shared/schemas.ts';
import { DEFAULT_SETTINGS } from '../../shared/settings.ts';
import { all, run, transaction, type Db } from '../db/database.ts';

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** Saved values over the defaults; a missing or unreadable value uses its default. */
export function getSettings(db: Db): Settings {
  const saved = new Map(all<{ key: string; value: string }>(db, 'SELECT key, value FROM settings').map((r) => [r.key, parseJson(r.value)]));
  const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  // Before preparation and clean-up had their own times, one changeover time set both.
  const legacy = saved.get('changeoverTime');
  if (legacy !== undefined) {
    if (!saved.has('prepTime')) saved.set('prepTime', legacy);
    if (!saved.has('cleanupTime')) saved.set('cleanupTime', legacy);
  }
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const parsed = settingsSchema.shape[key].safeParse(saved.get(key));
    if (parsed.success) settings[key] = parsed.data;
  }
  return settings as unknown as Settings;
}

const VENUE_LOGO_KEY = 'venue_logo';

/** The venue logo uploaded by the superadmin (SVG text), with a short hash that changes with it. */
export function getVenueLogo(db: Db): { svg: string; version: string } | null {
  const row = all<{ value: string }>(db, 'SELECT value FROM settings WHERE key = :key', { key: VENUE_LOGO_KEY })[0];
  const svg = row ? parseJson(row.value) : null;
  if (typeof svg !== 'string') return null;
  return { svg, version: createHash('sha1').update(svg).digest('base64url').slice(0, 12) };
}

export function setVenueLogo(db: Db, svg: string | null): void {
  if (svg === null) run(db, 'DELETE FROM settings WHERE key = :key', { key: VENUE_LOGO_KEY });
  else run(db, 'INSERT OR REPLACE INTO settings (key, value) VALUES (:key, :value)', { key: VENUE_LOGO_KEY, value: JSON.stringify(svg) });
}

export function saveSettings(db: Db, settings: Settings): void {
  transaction(db, () => {
    for (const [key, value] of Object.entries(settings)) {
      run(db, 'INSERT OR REPLACE INTO settings (key, value) VALUES (:key, :value)', { key, value: JSON.stringify(value) });
    }
  });
}
