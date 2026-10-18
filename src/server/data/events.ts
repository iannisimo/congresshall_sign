import type { EventBreak, ScheduledEvent } from '../../shared/model.ts';
import type { EventInput } from '../../shared/schemas.ts';
import { all, get, run, type Db } from '../db/database.ts';

interface EventRow {
  id: number;
  organizer_id: number;
  organizer_name: string;
  logo_id: number | null;
  title: string;
  subtitle: string | null;
  prep_at: number;
  start_at: number;
  end_at: number;
  release_at: number;
  visible: number;
  room_ids: string;
  breaks: string;
}

const SELECT = `
  SELECT e.*, o.name AS organizer_name,
    (SELECT json_group_array(room_id ORDER BY position) FROM event_rooms WHERE event_id = e.id) AS room_ids,
    (SELECT json_group_array(json_object('label', label, 'startAt', start_at, 'endAt', end_at) ORDER BY start_at)
       FROM event_breaks WHERE event_id = e.id) AS breaks
  FROM events e JOIN organizers o ON o.id = e.organizer_id`;

function toEvent(row: EventRow): ScheduledEvent {
  return {
    id: row.id,
    organizerId: row.organizer_id,
    organizerName: row.organizer_name,
    logoId: row.logo_id,
    title: row.title,
    subtitle: row.subtitle,
    roomIds: JSON.parse(row.room_ids) as number[],
    prepAt: row.prep_at,
    startAt: row.start_at,
    endAt: row.end_at,
    releaseAt: row.release_at,
    breaks: JSON.parse(row.breaks) as EventBreak[],
    visible: row.visible === 1,
  };
}

/** Events holding a room at some point in [from, to), from preparation to release. */
export function listEvents(db: Db, range: { from: number; to: number; visibleOnly?: boolean }): ScheduledEvent[] {
  const visible = range.visibleOnly ? 'AND e.visible = 1' : '';
  return all<EventRow>(
    db,
    `${SELECT} WHERE e.release_at > :from AND e.prep_at < :to ${visible} ORDER BY e.start_at, e.id`,
    { from: range.from, to: range.to },
  ).map(toEvent);
}

export function getEvent(db: Db, id: number): ScheduledEvent | undefined {
  const row = get<EventRow>(db, `${SELECT} WHERE e.id = :id`, { id });
  return row && toEvent(row);
}

function columns(input: EventInput) {
  return {
    organizerId: input.organizerId,
    logoId: input.logoId,
    title: input.title,
    subtitle: input.subtitle,
    prepAt: input.prepAt,
    startAt: input.startAt,
    endAt: input.endAt,
    releaseAt: input.releaseAt,
    visible: input.visible ? 1 : 0,
  };
}

function setRooms(db: Db, eventId: number, roomIds: number[]): void {
  run(db, 'DELETE FROM event_rooms WHERE event_id = :eventId', { eventId });
  roomIds.forEach((roomId, position) =>
    run(db, 'INSERT INTO event_rooms (event_id, room_id, position) VALUES (:eventId, :roomId, :position)', {
      eventId,
      roomId,
      position,
    }),
  );
}

function setBreaks(db: Db, eventId: number, breaks: EventBreak[]): void {
  run(db, 'DELETE FROM event_breaks WHERE event_id = :eventId', { eventId });
  for (const b of breaks) {
    run(db, 'INSERT INTO event_breaks (event_id, label, start_at, end_at) VALUES (:eventId, :label, :startAt, :endAt)', {
      eventId,
      label: b.label,
      startAt: b.startAt,
      endAt: b.endAt,
    });
  }
}

/** Call inside a transaction. */
export function insertEvent(db: Db, input: EventInput, now: number): number {
  const { lastInsertRowid: id } = run(
    db,
    `INSERT INTO events (organizer_id, logo_id, title, subtitle, prep_at, start_at, end_at, release_at, visible, created_at, updated_at)
     VALUES (:organizerId, :logoId, :title, :subtitle, :prepAt, :startAt, :endAt, :releaseAt, :visible, :now, :now)`,
    { ...columns(input), now },
  );
  setRooms(db, id, input.roomIds);
  setBreaks(db, id, input.breaks);
  return id;
}

/** Call inside a transaction. */
export function updateEvent(db: Db, id: number, input: EventInput, now: number): void {
  run(
    db,
    `UPDATE events SET organizer_id = :organizerId, logo_id = :logoId, title = :title, subtitle = :subtitle,
       prep_at = :prepAt, start_at = :startAt, end_at = :endAt, release_at = :releaseAt, visible = :visible,
       updated_at = :now
     WHERE id = :id`,
    { ...columns(input), id, now },
  );
  setRooms(db, id, input.roomIds);
  setBreaks(db, id, input.breaks);
}

export function deleteEvent(db: Db, id: number): boolean {
  return run(db, 'DELETE FROM events WHERE id = :id', { id }).changes > 0;
}
