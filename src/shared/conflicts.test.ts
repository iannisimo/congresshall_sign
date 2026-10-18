import { describe, expect, it } from 'vitest';
import { findConflicts } from './conflicts.ts';
import type { ScheduledEvent } from './model.ts';

function event(id: number, roomIds: number[], prepAt: number, releaseAt: number, visible = true): ScheduledEvent {
  return {
    id,
    organizerId: 1,
    organizerName: 'Org',
    logoId: null,
    title: `Event ${id}`,
    subtitle: null,
    roomIds,
    prepAt,
    startAt: prepAt,
    endAt: releaseAt,
    releaseAt,
    visible,
  };
}

describe('findConflicts', () => {
  const existing = [event(1, [1, 2], 100, 200), event(2, [3], 100, 200), event(3, [1], 300, 400, false)];

  it('finds overlapping events in shared rooms', () => {
    const conflicts = findConflicts({ roomIds: [2, 3], prepAt: 150, releaseAt: 250 }, existing);
    expect(conflicts.map((c) => [c.event.id, c.roomIds])).toEqual([
      [1, [2]],
      [2, [3]],
    ]);
  });

  it('allows back-to-back events', () => {
    expect(findConflicts({ roomIds: [1], prepAt: 200, releaseAt: 300 }, existing)).toEqual([]);
  });

  it('ignores the event being edited', () => {
    expect(findConflicts({ id: 1, roomIds: [1], prepAt: 150, releaseAt: 250 }, existing)).toEqual([]);
  });

  it('counts hidden events', () => {
    expect(findConflicts({ roomIds: [1], prepAt: 350, releaseAt: 500 }, existing).map((c) => c.event.id)).toEqual([3]);
  });
});
