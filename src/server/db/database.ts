import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { migrations } from './migrations.ts';

export type Db = DatabaseSync;
export type Params = Record<string, SQLInputValue>;

/** Opens (creating if needed) and migrates the database. Use ":memory:" in tests. */
export function openDatabase(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const current = Number(get<{ user_version: number }>(db, 'PRAGMA user_version')?.user_version ?? 0);
  migrations.slice(current).forEach((sql, i) => {
    transaction(db, () => {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${current + i + 1}`);
    });
  });
}

export function all<T>(db: Db, sql: string, params: Params = {}): T[] {
  return db.prepare(sql).all(params) as T[];
}

export function get<T>(db: Db, sql: string, params: Params = {}): T | undefined {
  return db.prepare(sql).get(params) as T | undefined;
}

export function run(db: Db, sql: string, params: Params = {}): { changes: number; lastInsertRowid: number } {
  const result = db.prepare(sql).run(params);
  return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
}

/** Runs `fn` in a transaction, or as part of the one already open. */
export function transaction<T>(db: Db, fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
