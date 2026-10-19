import type { Conflict, SignEvent } from './model.ts';

export interface ConflictCandidate {
  /** Set when editing, so the event doesn't clash with its own bookings. */
  eventId?: number;
  roomIds: number[];
  startAt: number;
  endAt: number;
}

/**
 * Bookings of other events running in one of the same rooms at the same time. Preparation and clean-up
 * don't count: they routinely overlap (the default ones span a day) and the room status handles that,
 * occupied beating reserved. Intervals are half-open, so a booking may start exactly when the previous one
 * ends. Hidden events count too, since they are drafts that will likely be published.
 */
export function findConflicts(candidate: ConflictCandidate, others: SignEvent[]): Conflict[] {
  const rooms = new Set(candidate.roomIds);
  const conflicts: Conflict[] = [];
  for (const booking of others) {
    if (candidate.eventId !== undefined && booking.eventId === candidate.eventId) continue;
    if (!(booking.startAt < candidate.endAt && candidate.startAt < booking.endAt)) continue;
    const shared = booking.roomIds.filter((id) => rooms.has(id));
    if (shared.length > 0) conflicts.push({ booking, roomIds: shared });
  }
  return conflicts;
}
