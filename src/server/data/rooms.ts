import type { Room, RoomKind } from '../../shared/model.ts';
import type { RoomInput } from '../../shared/schemas.ts';
import { all, get, run, transaction, type Db } from '../db/database.ts';

interface RoomRow {
  id: number;
  name: string;
  kind: RoomKind;
  sort_order: number;
  blocked_message: string | null;
  parent_ids: string;
}

const SELECT = `
  SELECT r.*, (SELECT json_group_array(parent_id ORDER BY parent_id) FROM room_parents WHERE room_id = r.id) AS parent_ids
  FROM rooms r`;

function toRoom(row: RoomRow): Room {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    sortOrder: row.sort_order,
    parentIds: JSON.parse(row.parent_ids) as number[],
    blockedMessage: row.blocked_message,
  };
}

export function listRooms(db: Db): Room[] {
  return all<RoomRow>(db, `${SELECT} ORDER BY r.sort_order, r.id`).map(toRoom);
}

export function getRoom(db: Db, id: number): Room | undefined {
  const row = get<RoomRow>(db, `${SELECT} WHERE r.id = :id`, { id });
  return row && toRoom(row);
}

function setParents(db: Db, roomId: number, parentIds: number[]): void {
  run(db, 'DELETE FROM room_parents WHERE room_id = :roomId', { roomId });
  for (const parentId of parentIds) {
    run(db, 'INSERT INTO room_parents (room_id, parent_id) VALUES (:roomId, :parentId)', { roomId, parentId });
  }
}

export function createRoom(db: Db, input: RoomInput): number {
  return transaction(db, () => {
    const { lastInsertRowid: id } = run(
      db,
      `INSERT INTO rooms (name, kind, blocked_message, sort_order)
       VALUES (:name, :kind, :blockedMessage, (SELECT coalesce(max(sort_order), -1) + 1 FROM rooms))`,
      { name: input.name, kind: input.kind, blockedMessage: input.blockedMessage },
    );
    setParents(db, id, input.parentIds);
    return id;
  });
}

export function updateRoom(db: Db, id: number, input: RoomInput): void {
  transaction(db, () => {
    run(db, 'UPDATE rooms SET name = :name, kind = :kind, blocked_message = :blockedMessage WHERE id = :id', {
      id,
      name: input.name,
      kind: input.kind,
      blockedMessage: input.blockedMessage,
    });
    setParents(db, id, input.parentIds);
  });
}

/** Removes the room; past bookings simply lose it from their room list. */
export function deleteRoom(db: Db, id: number): void {
  transaction(db, () => {
    run(db, 'DELETE FROM event_booking_rooms WHERE room_id = :id', { id });
    run(db, 'DELETE FROM rooms WHERE id = :id', { id });
  });
}

export function reorderRooms(db: Db, ids: number[]): void {
  transaction(db, () => {
    ids.forEach((id, index) => run(db, 'UPDATE rooms SET sort_order = :index WHERE id = :id', { id, index }));
  });
}

/** Bookings that still need the room (not yet released). */
export function countUpcomingBookings(db: Db, roomId: number, now: number): number {
  const row = get<{ n: number }>(
    db,
    `SELECT count(*) AS n FROM event_booking_rooms er JOIN event_bookings b ON b.id = er.booking_id
     WHERE er.room_id = :roomId AND b.release_at > :now`,
    { roomId, now },
  );
  return row?.n ?? 0;
}

export function countChildren(db: Db, roomId: number): number {
  return get<{ n: number }>(db, 'SELECT count(*) AS n FROM room_parents WHERE parent_id = :roomId', { roomId })?.n ?? 0;
}
