import type { Conflict, ScheduledEvent } from './model.ts';

export interface ConflictCandidate {
  /** Set when editing, so the event doesn't clash with itself. */
  id?: number;
  roomIds: number[];
  startAt: number;
  endAt: number;
}

/**
 * Events running in one of the same rooms at the same time. Preparation and clean-up don't count: they
 * routinely overlap (the default ones span a day) and the room status handles that, occupied beating
 * reserved. Intervals are half-open, so an event may start exactly when the previous one ends.
 * Hidden events count too, since they are drafts that will likely be published.
 */
export function findConflicts(candidate: ConflictCandidate, others: ScheduledEvent[]): Conflict[] {
  const rooms = new Set(candidate.roomIds);
  const conflicts: Conflict[] = [];
  for (const event of others) {
    if (event.id === candidate.id) continue;
    if (!(event.startAt < candidate.endAt && candidate.startAt < event.endAt)) continue;
    const shared = event.roomIds.filter((id) => rooms.has(id));
    if (shared.length > 0) conflicts.push({ event, roomIds: shared });
  }
  return conflicts;
}
