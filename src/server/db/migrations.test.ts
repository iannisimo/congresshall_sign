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

describe('migration 9: multi-day events', () => {
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
