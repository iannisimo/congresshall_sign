import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrations } from './migrations.ts';

const rows = (db: DatabaseSync, sql: string) => db.prepare(sql).all().map((r) => ({ ...r }));

describe('event-level margins migration', () => {
  it('moves prep and release to the event, keeping bookings, rooms and breaks', () => {
    const last = migrations.findIndex((sql) => sql.includes('event_bookings_new'));
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    for (const sql of migrations.slice(0, last)) db.exec(sql);
    db.exec(`
      INSERT INTO rooms (id, name, kind) VALUES (1, 'Sala A', 'main'), (2, 'Sala B', 'main');
      INSERT INTO organizers (id, name) VALUES (1, 'Unipi');
      INSERT INTO events (id, organizer_id, title, start_date, end_date, created_at, updated_at)
        VALUES (1, 1, 'Convegno', '2026-05-01', '2026-05-02', 0, 0);
      INSERT INTO event_days (id, event_id, date) VALUES (1, 1, '2026-05-01'), (2, 1, '2026-05-02');
      INSERT INTO event_bookings (id, day_id, prep_at, start_at, end_at, release_at) VALUES (1, 1, 100, 200, 300, 400), (2, 2, 150, 250, 350, 500);
      INSERT INTO event_booking_rooms (booking_id, room_id, position) VALUES (1, 1, 0), (2, 2, 0), (2, 1, 1);
      INSERT INTO event_booking_breaks (booking_id, label, start_at, end_at) VALUES (2, 'Break', 260, 270);
    `);
    db.exec(migrations[last]!);

    expect(rows(db, 'SELECT id, prep_at AS p, release_at AS r FROM events')).toEqual([{ id: 1, p: 100, r: 500 }]);
    expect(rows(db, 'SELECT id, start_at AS s, end_at AS e FROM event_bookings ORDER BY id')).toEqual([
      { id: 1, s: 200, e: 300 },
      { id: 2, s: 250, e: 350 },
    ]);
    expect(rows(db, 'SELECT count(*) AS n FROM event_booking_rooms')).toEqual([{ n: 3 }]);
    expect(rows(db, 'SELECT label FROM event_booking_breaks')).toEqual([{ label: 'Break' }]);
    // The rebuilt children reference the rebuilt bookings, so cascades still work.
    db.exec('DELETE FROM event_bookings WHERE id = 2');
    expect(rows(db, 'SELECT count(*) AS n FROM event_booking_rooms')).toEqual([{ n: 1 }]);
    expect(rows(db, 'SELECT count(*) AS n FROM event_booking_breaks')).toEqual([{ n: 0 }]);
    expect(() => db.exec('UPDATE events SET prep_at = 999 WHERE id = 1')).toThrow();
  });
});
