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
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const parsed = settingsSchema.shape[key].safeParse(saved.get(key));
    if (parsed.success) settings[key] = parsed.data;
  }
  return settings as unknown as Settings;
}

export function saveSettings(db: Db, settings: Settings): void {
  transaction(db, () => {
    for (const [key, value] of Object.entries(settings)) {
      run(db, 'INSERT OR REPLACE INTO settings (key, value) VALUES (:key, :value)', { key, value: JSON.stringify(value) });
    }
  });
}
