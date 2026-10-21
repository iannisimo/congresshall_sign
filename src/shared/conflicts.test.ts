import { describe, expect, it } from 'vitest';
import { findConflicts } from './conflicts.ts';
import type { SignEvent } from './model.ts';

/** Booking running [startAt, endAt), with long preparation and clean-up around it; its event has the same id. */
function booking(id: number, roomIds: number[], startAt: number, endAt: number, visible = true, eventId = id): SignEvent {
  return {
    id,
    eventId,
    date: '2026-10-17',
    organizerId: 1,
    organizerName: 'Org',
    logoId: null,
    title: `Event ${id}`,
    subtitle: null,
    roomIds,
    prepAt: startAt - 1000,
    startAt,
    endAt,
    releaseAt: endAt + 1000,
    breaks: [],
    visible,
    lowPriority: false,
  };
}

describe('findConflicts', () => {
  const existing = [booking(1, [1, 2], 100, 200), booking(2, [3], 100, 200), booking(3, [1], 300, 400, false)];

  it('finds bookings running at the same time in shared rooms', () => {
    const conflicts = findConflicts({ roomIds: [2, 3], startAt: 150, endAt: 250 }, existing);
    expect(conflicts.map((c) => [c.booking.id, c.roomIds])).toEqual([
      [1, [2]],
      [2, [3]],
    ]);
  });

  it('allows back-to-back bookings', () => {
    expect(findConflicts({ roomIds: [1], startAt: 200, endAt: 300 }, existing)).toEqual([]);
  });

  it('ignores overlapping preparation and clean-up', () => {
    // Event 1 is still being cleaned up (until 1200) and event 3 already prepared (from -700).
    expect(findConflicts({ roomIds: [1], startAt: 210, endAt: 290 }, existing)).toEqual([]);
  });

  it('ignores the bookings of the event being edited', () => {
    expect(findConflicts({ eventId: 1, roomIds: [1], startAt: 150, endAt: 250 }, existing)).toEqual([]);
    const sameEvent = [booking(10, [1], 100, 200, true, 5), booking(11, [2], 100, 200, true, 6)];
    expect(findConflicts({ eventId: 5, roomIds: [1, 2], startAt: 150, endAt: 250 }, sameEvent).map((c) => c.booking.id)).toEqual([11]);
  });

  it('counts hidden events', () => {
    expect(findConflicts({ roomIds: [1], startAt: 350, endAt: 500 }, existing).map((c) => c.booking.id)).toEqual([3]);
  });
});
