import type { EventBooking, EventBreak, EventDay, ScheduledEvent } from '../../shared/model.ts';
import type { EventInput } from '../../shared/schemas.ts';
import { toDateValue } from '../../shared/time.ts';
import { all, run, type Db } from '../db/database.ts';

interface EventRow {
  id: number;
  organizer_id: number;
  organizer_name: string;
  logo_id: number | null;
  title: string;
  subtitle: string | null;
  visible: number;
  low_priority: number;
  reception_notes: string | null;
  cost_cents: number | null;
  booking_number: string | null;
  start_date: string;
  end_date: string;
  prep_at: number;
  release_at: number;
}

interface DayRow {
  id: number;
  event_id: number;
  date: string;
  reception_notes: string | null;
  housekeeping_notes: string | null;
  restaurant_notes: string | null;
}

interface BookingRow {
  id: number;
  day_id: number;
  label: string | null;
  start_at: number;
  end_at: number;
}

/** Ids as a JSON array, so one prepared query can take any number of them. */
const idList = (ids: number[]) => JSON.stringify(ids);
const IN_IDS = 'IN (SELECT value FROM json_each(:ids))';

/** Builds whole events from the ids given, in that order: one query per table, assembled here. */
function loadEvents(db: Db, ids: number[]): ScheduledEvent[] {
  if (ids.length === 0) return [];
  const params = { ids: idList(ids) };
  const events = all<EventRow>(
    db,
    `SELECT e.*, o.name AS organizer_name FROM events e JOIN organizers o ON o.id = e.organizer_id WHERE e.id ${IN_IDS}`,
    params,
  );
  const dayRows = all<DayRow>(db, `SELECT * FROM event_days WHERE event_id ${IN_IDS} ORDER BY date`, params);
  const bookingRows = all<BookingRow>(
    db,
    `SELECT b.* FROM event_bookings b JOIN event_days d ON d.id = b.day_id WHERE d.event_id ${IN_IDS} ORDER BY b.start_at, b.id`,
    params,
  );
  const roomRows = all<{ booking_id: number; room_id: number }>(
    db,
    `SELECT r.booking_id, r.room_id FROM event_booking_rooms r
     JOIN event_bookings b ON b.id = r.booking_id JOIN event_days d ON d.id = b.day_id
     WHERE d.event_id ${IN_IDS} ORDER BY r.position`,
    params,
  );
  const breakRows = all<{ booking_id: number; label: string; start_at: number; end_at: number }>(
    db,
    `SELECT k.* FROM event_booking_breaks k
     JOIN event_bookings b ON b.id = k.booking_id JOIN event_days d ON d.id = b.day_id
     WHERE d.event_id ${IN_IDS} ORDER BY k.start_at`,
    params,
  );

  const group = <T>(rows: T[], key: (row: T) => number) => {
    const map = new Map<number, T[]>();
    for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
    return map;
  };
  const rooms = group(roomRows, (r) => r.booking_id);
  const breaks = group(breakRows, (r) => r.booking_id);
  const bookings = group(bookingRows, (r) => r.day_id);
  const days = group(dayRows, (r) => r.event_id);

  const toBooking = (row: BookingRow): EventBooking => ({
    id: row.id,
    label: row.label,
    roomIds: (rooms.get(row.id) ?? []).map((r) => r.room_id),
    startAt: row.start_at,
    endAt: row.end_at,
    breaks: (breaks.get(row.id) ?? []).map((k): EventBreak => ({ label: k.label, startAt: k.start_at, endAt: k.end_at })),
  });
  const toDay = (row: DayRow): EventDay => ({
    date: row.date,
    receptionNotes: row.reception_notes,
    housekeepingNotes: row.housekeeping_notes,
    restaurantNotes: row.restaurant_notes,
    bookings: (bookings.get(row.id) ?? []).map(toBooking),
  });

  const byId = new Map(events.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    return [
      {
        id: row.id,
        organizerId: row.organizer_id,
        organizerName: row.organizer_name,
        logoId: row.logo_id,
        title: row.title,
        subtitle: row.subtitle,
        visible: row.visible === 1,
        lowPriority: row.low_priority === 1,
        startDate: row.start_date,
        endDate: row.end_date,
        receptionNotes: row.reception_notes,
        costCents: row.cost_cents,
        bookingNumber: row.booking_number,
        prepAt: row.prep_at,
        releaseAt: row.release_at,
        days: (days.get(row.id) ?? []).map(toDay),
      },
    ];
  });
}

/**
 * Events holding rooms at some point in [from, to), from preparation to release, or with a
 * day whose date falls in that range. `to` is optional: no upper bound. Ordered by start date, then first
 * booking, then id.
 */
export function listEvents(db: Db, range: { from: number; to?: number; visibleOnly?: boolean }): ScheduledEvent[] {
  const params: Record<string, number | string> = { from: range.from, fromDate: toDateValue(range.from) };
  let held = 'e.release_at > :from';
  let dated = 'd.date >= :fromDate';
  if (range.to !== undefined) {
    params['to'] = range.to;
    params['toDate'] = toDateValue(range.to - 1);
    held += ' AND e.prep_at < :to';
    dated += ' AND d.date <= :toDate';
  }
  const ids = all<{ id: number }>(
    db,
    `SELECT e.id FROM events e
     WHERE (${held}
       OR EXISTS (SELECT 1 FROM event_days d WHERE d.event_id = e.id AND ${dated}))
       ${range.visibleOnly ? 'AND e.visible = 1' : ''}
     ORDER BY e.start_date,
       (SELECT min(b.start_at) FROM event_days d JOIN event_bookings b ON b.day_id = d.id WHERE d.event_id = e.id),
       e.id`,
    params,
  );
  return loadEvents(
    db,
    ids.map((row) => row.id),
  );
}

export function getEvent(db: Db, id: number): ScheduledEvent | undefined {
  return loadEvents(db, [id])[0];
}

/** Replaces every day and booking of the event. Call inside a transaction. */
function setDays(db: Db, eventId: number, input: EventInput): void {
  run(db, 'DELETE FROM event_days WHERE event_id = :eventId', { eventId });
  for (const day of input.days) {
    const { lastInsertRowid: dayId } = run(
      db,
      `INSERT INTO event_days (event_id, date, reception_notes, housekeeping_notes, restaurant_notes)
       VALUES (:eventId, :date, :receptionNotes, :housekeepingNotes, :restaurantNotes)`,
      {
        eventId,
        date: day.date,
        receptionNotes: day.receptionNotes,
        housekeepingNotes: day.housekeepingNotes,
        restaurantNotes: day.restaurantNotes,
      },
    );
    for (const booking of [...day.bookings].sort((a, b) => a.startAt - b.startAt)) {
      const { lastInsertRowid: bookingId } = run(
        db,
        `INSERT INTO event_bookings (day_id, label, start_at, end_at)
         VALUES (:dayId, :label, :startAt, :endAt)`,
        { dayId, label: booking.label, startAt: booking.startAt, endAt: booking.endAt },
      );
      booking.roomIds.forEach((roomId, position) =>
        run(db, 'INSERT INTO event_booking_rooms (booking_id, room_id, position) VALUES (:bookingId, :roomId, :position)', {
          bookingId,
          roomId,
          position,
        }),
      );
      for (const b of booking.breaks) {
        run(db, 'INSERT INTO event_booking_breaks (booking_id, label, start_at, end_at) VALUES (:bookingId, :label, :startAt, :endAt)', {
          bookingId,
          label: b.label,
          startAt: b.startAt,
          endAt: b.endAt,
        });
      }
    }
  }
}

function columns(input: EventInput) {
  return {
    organizerId: input.organizerId,
    logoId: input.logoId,
    title: input.title,
    subtitle: input.subtitle,
    visible: input.visible ? 1 : 0,
    lowPriority: input.lowPriority ? 1 : 0,
    receptionNotes: input.receptionNotes,
    costCents: input.costCents,
    bookingNumber: input.bookingNumber,
    startDate: input.days[0]!.date,
    endDate: input.days.at(-1)!.date,
    prepAt: input.prepAt,
    releaseAt: input.releaseAt,
  };
}

/** Call inside a transaction. */
export function insertEvent(db: Db, input: EventInput, now: number): number {
  const { lastInsertRowid: id } = run(
    db,
    `INSERT INTO events (organizer_id, logo_id, title, subtitle, visible, low_priority, reception_notes, cost_cents, booking_number, start_date, end_date, prep_at, release_at, created_at, updated_at)
     VALUES (:organizerId, :logoId, :title, :subtitle, :visible, :lowPriority, :receptionNotes, :costCents, :bookingNumber, :startDate, :endDate, :prepAt, :releaseAt, :now, :now)`,
    { ...columns(input), now },
  );
  setDays(db, id, input);
  return id;
}

/** Call inside a transaction. The event keeps its id; its days and bookings are replaced. */
export function updateEvent(db: Db, id: number, input: EventInput, now: number): void {
  run(
    db,
    `UPDATE events SET organizer_id = :organizerId, logo_id = :logoId, title = :title, subtitle = :subtitle,
       visible = :visible, low_priority = :lowPriority, reception_notes = :receptionNotes, cost_cents = :costCents, booking_number = :bookingNumber, start_date = :startDate, end_date = :endDate, prep_at = :prepAt, release_at = :releaseAt, updated_at = :now
     WHERE id = :id`,
    { ...columns(input), id, now },
  );
  setDays(db, id, input);
}

export function deleteEvent(db: Db, id: number): boolean {
  return run(db, 'DELETE FROM events WHERE id = :id', { id }).changes > 0;
}
