import type { SignSettings } from '../../shared/model.ts';
import { signSettingsSchema } from '../../shared/schemas.ts';
import { DEFAULT_SIGN_SETTINGS } from '../../shared/settings.ts';
import { all, run, transaction, type Db } from '../db/database.ts';

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** Saved values over the defaults; a missing or unreadable value uses its default. */
export function getSignSettings(db: Db): SignSettings {
  const saved = new Map(all<{ key: string; value: string }>(db, 'SELECT key, value FROM settings').map((r) => [r.key, parseJson(r.value)]));
  const settings = { ...DEFAULT_SIGN_SETTINGS };
  for (const key of Object.keys(settings) as (keyof SignSettings)[]) {
    const parsed = signSettingsSchema.shape[key].safeParse(saved.get(key));
    if (parsed.success) settings[key] = parsed.data;
  }
  return settings;
}

export function saveSignSettings(db: Db, settings: SignSettings): void {
  transaction(db, () => {
    for (const [key, value] of Object.entries(settings)) {
      run(db, 'INSERT OR REPLACE INTO settings (key, value) VALUES (:key, :value)', { key, value: JSON.stringify(value) });
    }
  });
}
