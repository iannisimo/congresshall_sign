import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { MediaFit, Takeover } from '../../shared/model.ts';
import { all, get, run, type Db } from '../db/database.ts';

interface TakeoverRow {
  id: number;
  name: string;
  mime: string;
  file: string;
  size: number;
  start_at: number;
  end_at: number;
  fit: MediaFit;
  show_header: number | null;
  show_footer: number | null;
}

export type StoredTakeover = Takeover & { mime: string; file: string };

const flag = (value: number | null) => (value === null ? null : value === 1);

function toTakeover(row: TakeoverRow): StoredTakeover {
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    file: row.file,
    startAt: row.start_at,
    endAt: row.end_at,
    fit: row.fit,
    header: flag(row.show_header),
    footer: flag(row.show_footer),
  };
}

/** Takeovers that haven't ended, soonest first. */
export function listTakeovers(db: Db, now: number): StoredTakeover[] {
  return all<TakeoverRow>(db, 'SELECT * FROM takeovers WHERE end_at > :now ORDER BY start_at, id', { now }).map(toTakeover);
}

export function getTakeover(db: Db, id: number): StoredTakeover | undefined {
  const row = get<TakeoverRow>(db, 'SELECT * FROM takeovers WHERE id = :id', { id });
  return row && toTakeover(row);
}

export function insertTakeover(
  db: Db,
  takeover: Omit<StoredTakeover, 'id'> & { size: number },
  now: number,
): number {
  return run(
    db,
    `INSERT INTO takeovers (name, mime, file, size, start_at, end_at, fit, show_header, show_footer, created_at)
     VALUES (:name, :mime, :file, :size, :startAt, :endAt, :fit, :header, :footer, :now)`,
    {
      name: takeover.name,
      mime: takeover.mime,
      file: takeover.file,
      size: takeover.size,
      startAt: takeover.startAt,
      endAt: takeover.endAt,
      fit: takeover.fit,
      header: takeover.header === null ? null : takeover.header ? 1 : 0,
      footer: takeover.footer === null ? null : takeover.footer ? 1 : 0,
      now,
    },
  ).lastInsertRowid;
}

export function updateTakeover(
  db: Db,
  id: number,
  patch: Pick<Takeover, 'name' | 'startAt' | 'endAt' | 'fit' | 'header' | 'footer'>,
): void {
  run(
    db,
    `UPDATE takeovers SET name = :name, start_at = :startAt, end_at = :endAt, fit = :fit,
       show_header = :header, show_footer = :footer WHERE id = :id`,
    {
      id,
      name: patch.name,
      startAt: patch.startAt,
      endAt: patch.endAt,
      fit: patch.fit,
      header: patch.header === null ? null : patch.header ? 1 : 0,
      footer: patch.footer === null ? null : patch.footer ? 1 : 0,
    },
  );
}

export function deleteTakeover(db: Db, id: number): boolean {
  return run(db, 'DELETE FROM takeovers WHERE id = :id', { id }).changes > 0;
}

/** Deletes the takeovers whose time has run out, with their files. Returns how many. */
export async function purgeExpiredTakeovers(db: Db, dir: string, now: number): Promise<number> {
  const expired = all<{ id: number; file: string }>(db, 'SELECT id, file FROM takeovers WHERE end_at <= :now', { now });
  for (const { id, file } of expired) {
    deleteTakeover(db, id);
    await rm(join(dir, file), { force: true });
  }
  return expired.length;
}
