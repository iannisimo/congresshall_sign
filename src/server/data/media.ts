import type { MediaFit, MediaItem, MediaKind, MediaPreset } from '../../shared/model.ts';
import { all, get, run, transaction, type Db } from '../db/database.ts';

interface MediaRow {
  id: number;
  kind: MediaKind;
  name: string;
  mime: string;
  file: string;
  size: number;
}

export type StoredMedia = MediaItem & { file: string };

function toMedia(row: MediaRow): StoredMedia {
  return { id: row.id, kind: row.kind, name: row.name, mime: row.mime, size: row.size, file: row.file };
}

/** The library, newest first. */
export function listMedia(db: Db): StoredMedia[] {
  return all<MediaRow>(db, 'SELECT * FROM media ORDER BY created_at DESC, id DESC').map(toMedia);
}

export function getMedia(db: Db, id: number): StoredMedia | undefined {
  const row = get<MediaRow>(db, 'SELECT * FROM media WHERE id = :id', { id });
  return row && toMedia(row);
}

/** Adds the file to the library and, enabled and last, to the given preset (default: the default one). */
export function insertMedia(db: Db, media: Omit<StoredMedia, 'id'>, now: number, presetId?: number): number {
  return transaction(db, () => {
    const id = run(
      db,
      `INSERT INTO media (id, kind, name, mime, file, size, created_at)
       VALUES ((SELECT next FROM id_sequences WHERE name = 'media'), :kind, :name, :mime, :file, :size, :now)`,
      { ...media, now },
    ).lastInsertRowid;
    run(
      db,
      `INSERT INTO media_preset_items (preset_id, media_id, position, enabled, fit)
       VALUES (coalesce(:presetId, (SELECT id FROM media_presets WHERE is_default = 1)), :id,
         (SELECT coalesce(max(position), -1) + 1 FROM media_preset_items
           WHERE preset_id = coalesce(:presetId, (SELECT id FROM media_presets WHERE is_default = 1))), 1, NULL)`,
      { id, presetId: presetId ?? null },
    );
    return id;
  });
}

export function deleteMedia(db: Db, id: number): boolean {
  return run(db, 'DELETE FROM media WHERE id = :id', { id }).changes > 0;
}

interface PresetRow {
  id: number;
  name: string;
  label: string;
  image_seconds: number | null;
  fit: MediaFit | null;
  is_default: number;
}
interface PresetItemRow {
  preset_id: number;
  media_id: number;
  enabled: number;
  fit: MediaFit | null;
}

/** All presets, the default first, then by sort order. */
export function listPresets(db: Db): MediaPreset[] {
  const items = all<PresetItemRow>(db, 'SELECT * FROM media_preset_items ORDER BY position');
  return all<PresetRow>(db, 'SELECT * FROM media_presets ORDER BY is_default DESC, sort_order, id').map((row) => ({
    id: row.id,
    name: row.name,
    label: row.label,
    isDefault: row.is_default === 1,
    imageSeconds: row.image_seconds,
    fit: row.fit,
    items: items.filter((i) => i.preset_id === row.id).map((i) => ({ mediaId: i.media_id, enabled: i.enabled === 1, fit: i.fit })),
  }));
}

export function getPreset(db: Db, id: number): MediaPreset | undefined {
  return listPresets(db).find((p) => p.id === id);
}

/** The preset with that name, or the default one when the name is missing or unknown. */
export function presetByNameOrDefault(db: Db, name: string | undefined): MediaPreset {
  const presets = listPresets(db);
  return presets.find((p) => p.name === name) ?? presets.find((p) => p.isDefault)!;
}

export function presetNameTaken(db: Db, name: string, exceptId?: number): boolean {
  return !!get(db, 'SELECT 1 FROM media_presets WHERE name = :name AND id != :id', { name, id: exceptId ?? 0 });
}

/** A new preset, empty or with a copy of another one's settings and items. */
export function insertPreset(db: Db, preset: { name: string; label: string }, copyFrom?: MediaPreset): number {
  return transaction(db, () => {
    const id = run(
      db,
      `INSERT INTO media_presets (name, label, sort_order, image_seconds, fit)
       VALUES (:name, :label, (SELECT coalesce(max(sort_order), -1) + 1 FROM media_presets), :imageSeconds, :fit)`,
      { ...preset, imageSeconds: copyFrom?.imageSeconds ?? null, fit: copyFrom?.fit ?? null },
    ).lastInsertRowid;
    if (copyFrom) setPresetItems(db, id, copyFrom.items);
    return id;
  });
}

export function updatePreset(
  db: Db,
  id: number,
  patch: { name?: string; label?: string; imageSeconds?: number | null; fit?: MediaFit | null },
): void {
  transaction(db, () => {
    if (patch.name !== undefined) run(db, 'UPDATE media_presets SET name = :v WHERE id = :id', { id, v: patch.name });
    if (patch.label !== undefined) run(db, 'UPDATE media_presets SET label = :v WHERE id = :id', { id, v: patch.label });
    if (patch.imageSeconds !== undefined) run(db, 'UPDATE media_presets SET image_seconds = :v WHERE id = :id', { id, v: patch.imageSeconds });
    if (patch.fit !== undefined) run(db, 'UPDATE media_presets SET fit = :v WHERE id = :id', { id, v: patch.fit });
  });
}

/** Replaces the preset's items with this ordered list. */
export function setPresetItems(db: Db, presetId: number, items: MediaPreset['items']): void {
  transaction(db, () => {
    run(db, 'DELETE FROM media_preset_items WHERE preset_id = :presetId', { presetId });
    items.forEach((item, position) =>
      run(
        db,
        `INSERT INTO media_preset_items (preset_id, media_id, position, enabled, fit)
         VALUES (:presetId, :mediaId, :position, :enabled, :fit)`,
        { presetId, mediaId: item.mediaId, position, enabled: item.enabled ? 1 : 0, fit: item.fit },
      ),
    );
  });
}

export function makeDefaultPreset(db: Db, id: number): void {
  transaction(db, () => {
    run(db, 'UPDATE media_presets SET is_default = 0 WHERE is_default = 1');
    run(db, 'UPDATE media_presets SET is_default = 1 WHERE id = :id', { id });
  });
}

export function deletePreset(db: Db, id: number): void {
  run(db, 'DELETE FROM media_presets WHERE id = :id', { id });
}
