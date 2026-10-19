import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { listEvents } from '../data/events.ts';
import { listOrganizers } from '../data/organizers.ts';
import { listRooms } from '../data/rooms.ts';
import { openDatabase } from './database.ts';
import { migrations } from './migrations.ts';

describe('multi-day events migration', () => {
  it('drops the old events and keeps organizers, logos and rooms', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'sign-migration-')), 'old.db');
    const old = new DatabaseSync(path);
    old.exec('PRAGMA foreign_keys = ON');
    migrations.slice(0, 8).forEach((sql) => old.exec(sql));
    old.exec(`
      INSERT INTO rooms (id, name, kind) VALUES (1, 'Sala A', 'main');
      INSERT INTO organizers (id, name) VALUES (1, 'Unipi');
      INSERT INTO events (id, organizer_id, title, prep_at, start_at, end_at, release_at, created_at, updated_at)
        VALUES (1, 1, 'Convegno', 1, 2, 3, 4, 0, 0);
      INSERT INTO event_rooms (event_id, room_id, position) VALUES (1, 1, 0);
      INSERT INTO event_breaks (event_id, label, start_at, end_at) VALUES (1, 'Break', 2, 3);
      PRAGMA user_version = 8;
    `);
    old.close();

    const db = openDatabase(path);
    expect(listEvents(db, { from: 0 })).toEqual([]);
    expect(listOrganizers(db).map((o) => o.name)).toEqual(['Unipi']);
    expect(listRooms(db).map((r) => r.name)).toEqual(['Sala A']);
    expect(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('event_days', 'event_bookings', 'event_booking_rooms', 'event_booking_breaks')").get()).toEqual({ n: 4 });
    expect(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('event_rooms', 'event_breaks')").get()).toEqual({ n: 0 });
    db.close();
  });
});

describe('media presets migration', () => {
  it('moves order, enabled and fit of the media into the default preset', () => {
    const at = migrations.findIndex((sql) => sql.includes('CREATE TABLE media_presets'));
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    for (const sql of migrations.slice(0, at)) db.exec(sql);
    const insert = db.prepare(
      "INSERT INTO media (id, kind, name, mime, file, size, sort_order, created_at, enabled, fit) VALUES (?, 'image', ?, 'image/png', ?, 1, ?, 0, ?, ?)",
    );
    insert.run(1, 'one', 'one.png', 2, 1, null);
    insert.run(2, 'two', 'two.png', 0, 0, 'cover');
    insert.run(3, 'three', 'three.png', 1, 1, 'fill');
    db.exec(migrations[at]!);

    const items = db
      .prepare('SELECT media_id AS mediaId, enabled, fit FROM media_preset_items ORDER BY position')
      .all()
      .map((r) => ({ ...r }));
    expect(items).toEqual([
      { mediaId: 2, enabled: 0, fit: 'cover' },
      { mediaId: 3, enabled: 1, fit: 'fill' },
      { mediaId: 1, enabled: 1, fit: null },
    ]);
    expect({ ...db.prepare('SELECT name, label, is_default AS d, image_seconds AS s, fit FROM media_presets').get() }).toEqual({
      name: 'default',
      label: 'Predefinito',
      d: 1,
      s: null,
      fit: null,
    });
    expect({ ...db.prepare('SELECT count(*) AS n FROM media').get() }).toEqual({ n: 3 });
  });
});
