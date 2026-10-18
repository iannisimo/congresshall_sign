import type { Conflict, ScheduledEvent } from './model.ts';

export interface ConflictCandidate {
  /** Set when editing, so the event doesn't clash with itself. */
  id?: number;
  roomIds: number[];
  prepAt: number;
  releaseAt: number;
}

/**
 * Events that book one of the same rooms while the candidate holds them, from preparation to release.
 * Intervals are half-open: an event may start preparing exactly when the previous one releases.
 * Hidden events count too, since they are drafts that will likely be published.
 */
export function findConflicts(candidate: ConflictCandidate, others: ScheduledEvent[]): Conflict[] {
  const rooms = new Set(candidate.roomIds);
  const conflicts: Conflict[] = [];
  for (const event of others) {
    if (event.id === candidate.id) continue;
    if (!(event.prepAt < candidate.releaseAt && candidate.prepAt < event.releaseAt)) continue;
    const shared = event.roomIds.filter((id) => rooms.has(id));
    if (shared.length > 0) conflicts.push({ event, roomIds: shared });
  }
  return conflicts;
}
