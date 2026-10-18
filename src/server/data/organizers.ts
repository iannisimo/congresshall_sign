import type { Organizer } from '../../shared/model.ts';
import { all, get, run, type Db } from '../db/database.ts';

interface OrganizerRow {
  id: number;
  name: string;
  logo_ids: string;
  event_count: number;
}

const SELECT = `
  SELECT o.id, o.name,
    (SELECT json_group_array(id ORDER BY id) FROM logos WHERE organizer_id = o.id) AS logo_ids,
    (SELECT count(*) FROM events WHERE organizer_id = o.id) AS event_count
  FROM organizers o`;

function toOrganizer(row: OrganizerRow): Organizer {
  return { id: row.id, name: row.name, logoIds: JSON.parse(row.logo_ids) as number[], eventCount: row.event_count };
}

export function listOrganizers(db: Db): Organizer[] {
  return all<OrganizerRow>(db, `${SELECT} ORDER BY o.name COLLATE NOCASE`).map(toOrganizer);
}

export function getOrganizer(db: Db, id: number): Organizer | undefined {
  const row = get<OrganizerRow>(db, `${SELECT} WHERE o.id = :id`, { id });
  return row && toOrganizer(row);
}

/** Case-insensitive, like the unique index. */
export function findOrganizerByName(db: Db, name: string): Organizer | undefined {
  const row = get<OrganizerRow>(db, `${SELECT} WHERE o.name = :name COLLATE NOCASE`, { name });
  return row && toOrganizer(row);
}

export function createOrganizer(db: Db, name: string): number {
  return run(db, 'INSERT INTO organizers (name) VALUES (:name)', { name }).lastInsertRowid;
}

export function renameOrganizer(db: Db, id: number, name: string): void {
  run(db, 'UPDATE organizers SET name = :name WHERE id = :id', { id, name });
}

/** Also deletes its logos. Callers check that no event uses it. */
export function deleteOrganizer(db: Db, id: number): void {
  run(db, 'DELETE FROM organizers WHERE id = :id', { id });
}

export interface StoredLogo {
  id: number;
  organizerId: number;
  mime: string;
  data: Uint8Array;
}

export function insertLogo(
  db: Db,
  logo: { organizerId: number; mime: string; data: Uint8Array; width: number; height: number },
  now: number,
): number {
  return run(
    db,
    `INSERT INTO logos (id, organizer_id, mime, data, width, height, created_at)
     VALUES ((SELECT next FROM id_sequences WHERE name = 'logos'), :organizerId, :mime, :data, :width, :height, :now)`,
    { ...logo, now },
  ).lastInsertRowid;
}

export function getLogo(db: Db, id: number): StoredLogo | undefined {
  const row = get<{ id: number; organizer_id: number; mime: string; data: Uint8Array }>(
    db,
    'SELECT id, organizer_id, mime, data FROM logos WHERE id = :id',
    { id },
  );
  return row && { id: row.id, organizerId: row.organizer_id, mime: row.mime, data: row.data };
}

export function countLogoUses(db: Db, id: number): number {
  return get<{ n: number }>(db, 'SELECT count(*) AS n FROM events WHERE logo_id = :id', { id })?.n ?? 0;
}

export function deleteLogo(db: Db, id: number): boolean {
  return run(db, 'DELETE FROM logos WHERE id = :id', { id }).changes > 0;
}

export function logoOwner(db: Db, id: number): number | undefined {
  return get<{ organizer_id: number }>(db, 'SELECT organizer_id FROM logos WHERE id = :id', { id })?.organizer_id;
}
