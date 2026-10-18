import type { MediaFit, MediaItem, MediaKind } from '../../shared/model.ts';
import { all, get, run, transaction, type Db } from '../db/database.ts';

interface MediaRow {
  id: number;
  kind: MediaKind;
  name: string;
  mime: string;
  file: string;
  size: number;
  enabled: number;
  fit: MediaFit | null;
}

export type StoredMedia = MediaItem & { file: string };

function toMedia(row: MediaRow): StoredMedia {
  return { id: row.id, kind: row.kind, name: row.name, mime: row.mime, size: row.size, file: row.file, enabled: row.enabled === 1, fit: row.fit };
}

export function listMedia(db: Db): StoredMedia[] {
  return all<MediaRow>(db, 'SELECT * FROM media ORDER BY sort_order, id').map(toMedia);
}

export function getMedia(db: Db, id: number): StoredMedia | undefined {
  const row = get<MediaRow>(db, 'SELECT * FROM media WHERE id = :id', { id });
  return row && toMedia(row);
}

export function insertMedia(db: Db, media: Omit<StoredMedia, 'id' | 'enabled' | 'fit'>, now: number): number {
  return run(
    db,
    `INSERT INTO media (kind, name, mime, file, size, sort_order, created_at)
     VALUES (:kind, :name, :mime, :file, :size, (SELECT coalesce(max(sort_order), -1) + 1 FROM media), :now)`,
    { ...media, now },
  ).lastInsertRowid;
}

export function updateMedia(db: Db, id: number, patch: { enabled?: boolean; fit?: MediaFit | null }): void {
  if (patch.enabled !== undefined) run(db, 'UPDATE media SET enabled = :enabled WHERE id = :id', { id, enabled: patch.enabled ? 1 : 0 });
  if (patch.fit !== undefined) run(db, 'UPDATE media SET fit = :fit WHERE id = :id', { id, fit: patch.fit });
}

export function deleteMedia(db: Db, id: number): boolean {
  return run(db, 'DELETE FROM media WHERE id = :id', { id }).changes > 0;
}

export function reorderMedia(db: Db, ids: number[]): void {
  transaction(db, () => {
    ids.forEach((id, index) => run(db, 'UPDATE media SET sort_order = :index WHERE id = :id', { id, index }));
  });
}
