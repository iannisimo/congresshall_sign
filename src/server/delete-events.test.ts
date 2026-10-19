import { describe, expect, it } from 'vitest';
import { get, openDatabase, run } from './db/database.ts';
import { deleteAllEvents } from './delete-events.ts';

function seed() {
  const db = openDatabase(':memory:');
  run(db, "INSERT INTO organizers (id, name) VALUES (1, 'Unipi')");
  run(db, "INSERT INTO rooms (id, name, kind) VALUES (1, 'Sala A', 'main')");
  for (const id of [1, 2]) {
    run(db, `INSERT INTO events (id, organizer_id, title, start_date, end_date, created_at, updated_at) VALUES (${id}, 1, 'E', '2026-10-20', '2026-10-20', 0, 0)`);
    run(db, `INSERT INTO event_days (id, event_id, date) VALUES (${id}, ${id}, '2026-10-20')`);
    run(db, `INSERT INTO event_bookings (id, day_id, prep_at, start_at, end_at, release_at) VALUES (${id}, ${id}, 1, 2, 3, 4)`);
    run(db, `INSERT INTO event_booking_rooms (booking_id, room_id, position) VALUES (${id}, 1, 0)`);
    run(db, `INSERT INTO event_booking_breaks (booking_id, label, start_at, end_at) VALUES (${id}, 'b', 2, 3)`);
  }
  return db;
}

const count = (db: ReturnType<typeof seed>, table: string) => Number(get<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${table}`)?.n);

describe('deleteAllEvents', () => {
  it('only counts without confirmation', () => {
    const db = seed();
    expect(deleteAllEvents(db, false)).toBe(2);
    expect(count(db, 'events')).toBe(2);
  });

  it('removes events and their children but keeps rooms and organizers', () => {
    const db = seed();
    expect(deleteAllEvents(db, true)).toBe(2);
    for (const t of ['events', 'event_days', 'event_bookings', 'event_booking_rooms', 'event_booking_breaks']) expect(count(db, t)).toBe(0);
    expect(count(db, 'rooms')).toBe(1);
    expect(count(db, 'organizers')).toBe(1);
  });
});
