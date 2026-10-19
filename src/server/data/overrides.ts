import type { Override, RoomStatusKind } from '../../shared/model.ts';
import { flattenEvents } from '../../shared/events.ts';
import { computeRoomStatuses } from '../../shared/status.ts';
import { all, run, type Db } from '../db/database.ts';
import { listEvents } from './events.ts';
import { listRooms } from './rooms.ts';

interface OverrideRow {
  room_id: number;
  status: RoomStatusKind;
  message: string | null;
  created_at: number;
  expires_at: number | null;
  until_next_change: number;
}

function toOverride(row: OverrideRow): Override {
  return {
    roomId: row.room_id,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    untilNextChange: row.until_next_change === 1,
  };
}

export function listOverrides(db: Db): Override[] {
  return all<OverrideRow>(db, 'SELECT * FROM overrides ORDER BY room_id').map(toOverride);
}

/** One override per room: a new one replaces the old. */
export function setOverride(db: Db, o: Override): void {
  run(
    db,
    `INSERT OR REPLACE INTO overrides (room_id, status, message, created_at, expires_at, until_next_change)
     VALUES (:roomId, :status, :message, :createdAt, :expiresAt, :untilNextChange)`,
    { ...o, untilNextChange: o.untilNextChange ? 1 : 0 },
  );
}

export function deleteOverride(db: Db, roomId: number): boolean {
  return run(db, 'DELETE FROM overrides WHERE room_id = :roomId', { roomId }).changes > 0;
}

/**
 * Deletes overrides that no longer apply, using the same rules as the sign, and returns the rest.
 * Keeps the snapshot small and changes its ETag when an override ends.
 */
export function activeOverrides(db: Db, now: number): Override[] {
  const overrides = listOverrides(db);
  if (overrides.length === 0) return overrides;

  // Every booking that could have changed a status between the oldest override and now.
  const from = Math.min(...overrides.map((o) => o.createdAt));
  const events = flattenEvents(listEvents(db, { from, to: now + 1, visibleOnly: true })).filter(
    (b) => b.releaseAt > from && b.prepAt < now + 1,
  );
  const statuses = computeRoomStatuses({ rooms: listRooms(db), events, overrides, now });

  return overrides.filter((o) => {
    if (statuses.get(o.roomId)?.reason === 'override') return true;
    deleteOverride(db, o.roomId);
    return false;
  });
}
