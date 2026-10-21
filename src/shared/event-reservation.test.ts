import { describe, expect, it } from 'vitest';
import { flattenEvent } from './events.ts';
import type { Room, ScheduledEvent } from './model.ts';
import { computeRoomStatuses } from './status.ts';

const local = (iso: string) => new Date(iso).getTime();
const room = (id: number): Room => ({ id, name: `Room ${id}`, kind: 'main', sortOrder: id, parentIds: [], blockedMessage: null });
const booking = (id: number, date: string, roomId: number) => ({
  id,
  label: null,
  roomIds: [roomId],
  startAt: local(`${date}T09:00`),
  endAt: local(`${date}T17:00`),
  breaks: [],
});

// Room 1 only on day 1, room 2 only on day 3, nothing on day 2.
const congress: ScheduledEvent = {
  id: 1,
  organizerId: 1,
  organizerName: 'Org',
  logoId: null,
  title: 'Congresso',
  subtitle: null,
  visible: true,
  lowPriority: false,
  startDate: '2026-10-20',
  endDate: '2026-10-22',
  receptionNotes: null,
  costCents: null,
  bookingNumber: null,
  prepAt: local('2026-10-19T14:00'),
  releaseAt: local('2026-10-23T14:00'),
  days: [
    { date: '2026-10-20', receptionNotes: null, housekeepingNotes: null, restaurantNotes: null, bookings: [booking(1, '2026-10-20', 1)] },
    { date: '2026-10-21', receptionNotes: null, housekeepingNotes: null, restaurantNotes: null, bookings: [] },
    { date: '2026-10-22', receptionNotes: null, housekeepingNotes: null, restaurantNotes: null, bookings: [booking(2, '2026-10-22', 2)] },
  ],
};

const statuses = (iso: string) => computeRoomStatuses({ rooms: [room(1), room(2)], events: flattenEvent(congress), overrides: [], now: local(iso) });

describe('event-level reservation', () => {
  it('reserves every room of the event for the whole span, occupied only during its own bookings', () => {
    expect(statuses('2026-10-19T13:00').get(1)).toMatchObject({ status: 'free' });
    expect(statuses('2026-10-19T15:00').get(2)).toMatchObject({ status: 'reserved', reason: 'prep' });
    expect(statuses('2026-10-20T10:00').get(1)).toMatchObject({ status: 'occupied' });
    expect(statuses('2026-10-20T10:00').get(2)).toMatchObject({ status: 'reserved', reason: 'prep' });
    for (const iso of ['2026-10-20T20:00', '2026-10-21T10:00']) {
      expect(statuses(iso).get(1)).toMatchObject({ status: 'reserved', reason: 'cleanup' });
      expect(statuses(iso).get(2)).toMatchObject({ status: 'reserved', reason: 'prep' });
    }
    expect(statuses('2026-10-22T10:00').get(2)).toMatchObject({ status: 'occupied' });
    expect(statuses('2026-10-22T10:00').get(1)).toMatchObject({ status: 'reserved' });
    expect(statuses('2026-10-23T15:00').get(2)).toMatchObject({ status: 'free' });
  });
});
