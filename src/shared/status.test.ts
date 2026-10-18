import { describe, expect, it } from 'vitest';
import type { Override, Room, ScheduledEvent } from './model.ts';
import { computeRoomStatuses, eventPhase } from './status.ts';
import { changeoverMargins, HOUR, MINUTE } from './time.ts';

const T0 = Date.UTC(2026, 9, 17, 8, 0); // reference "now"; offsets below are relative to it

function room(id: number, extra: Partial<Room> = {}): Room {
  return { id, name: `Room ${id}`, kind: 'main', sortOrder: id, parentIds: [], blockedMessage: null, ...extra };
}

/** Event with prep 30 min before start and clean-up 30 min after end. Times are hours from T0. */
function event(id: number, roomIds: number[], startH: number, endH: number, extra: Partial<ScheduledEvent> = {}): ScheduledEvent {
  const startAt = T0 + startH * HOUR;
  const endAt = T0 + endH * HOUR;
  return {
    id,
    organizerId: 1,
    organizerName: 'Org',
    logoId: null,
    title: `Event ${id}`,
    subtitle: null,
    roomIds,
    prepAt: startAt - 30 * MINUTE,
    startAt,
    endAt,
    releaseAt: endAt + 30 * MINUTE,
    visible: true,
    ...extra,
  };
}

function override(roomId: number, extra: Partial<Override> = {}): Override {
  return { roomId, status: 'reserved', message: 'Lavori', createdAt: T0, expiresAt: null, untilNextChange: false, ...extra };
}

function statusAt(now: number, rooms: Room[], events: ScheduledEvent[], overrides: Override[] = []) {
  return computeRoomStatuses({ rooms, events, overrides, now });
}

const at = (hours: number) => T0 + hours * HOUR;

describe('eventPhase', () => {
  const e = event(1, [1], 2, 4);
  it.each([
    [1, 'upcoming'],
    [1.5, 'prep'],
    [2, 'live'],
    [3.99, 'live'],
    [4, 'cleanup'],
    [4.5, 'over'],
  ] as const)('at +%sh is %s', (h, phase) => {
    expect(eventPhase(e, at(h))).toBe(phase);
  });
});

describe('computeRoomStatuses: own events', () => {
  const rooms = [room(1)];
  const events = [event(1, [1], 2, 4)];

  it('is free with nothing scheduled', () => {
    expect(statusAt(at(0), rooms, [])).toEqual(
      new Map([[1, { status: 'free', reason: 'idle', message: null, eventId: null, changesAt: null }]]),
    );
  });

  it('follows the event lifecycle: free, reserved, occupied, reserved, free', () => {
    expect(statusAt(at(0), rooms, events).get(1)).toMatchObject({ status: 'free', changesAt: at(1.5) });
    expect(statusAt(at(1.5), rooms, events).get(1)).toMatchObject({
      status: 'reserved',
      reason: 'prep',
      eventId: 1,
      changesAt: at(2),
    });
    expect(statusAt(at(3), rooms, events).get(1)).toMatchObject({ status: 'occupied', reason: 'event', changesAt: at(4) });
    expect(statusAt(at(4.2), rooms, events).get(1)).toMatchObject({ status: 'reserved', reason: 'cleanup', changesAt: at(4.5) });
    expect(statusAt(at(4.5), rooms, events).get(1)).toMatchObject({ status: 'free', reason: 'idle', changesAt: null });
  });

  it('ignores hidden events', () => {
    const hidden = [event(1, [1], 2, 4, { visible: false })];
    expect(statusAt(at(3), rooms, hidden).get(1)).toMatchObject({ status: 'free', changesAt: null });
  });

  it('only affects the booked rooms', () => {
    const s = statusAt(at(3), [room(1), room(2)], events);
    expect(s.get(2)).toMatchObject({ status: 'free' });
  });

  it('prefers occupied when events overlap', () => {
    // Event 1 is cleaning up while event 2 is already running.
    const overlapping = [event(1, [1], 2, 4), event(2, [1], 4, 6, { prepAt: at(3.5) })];
    expect(statusAt(at(4.1), rooms, overlapping).get(1)).toMatchObject({ status: 'occupied', eventId: 2 });
  });

  it('skips boundaries that do not change what the sign shows', () => {
    // Clean-up of event 1 runs straight into the preparation of event 2: "reserved" until event 2 starts.
    const backToBack = [event(1, [1], 2, 4), event(2, [1], 5, 6)];
    expect(statusAt(at(4.1), rooms, backToBack).get(1)).toMatchObject({ status: 'reserved', changesAt: at(5) });
  });
});

describe('computeRoomStatuses: sub-rooms', () => {
  const rooms = [room(1), room(2), room(10, { kind: 'sub', parentIds: [1, 2], blockedMessage: 'Riservata' })];

  it('is reserved with its message only while a parent event is running', () => {
    const events = [event(1, [1], 2, 4)];
    expect(statusAt(at(1.6), rooms, events).get(10)).toMatchObject({ status: 'free', changesAt: at(2) });
    expect(statusAt(at(3), rooms, events).get(10)).toMatchObject({
      status: 'reserved',
      reason: 'parent',
      message: 'Riservata',
      eventId: 1,
      changesAt: at(4),
    });
    expect(statusAt(at(4.2), rooms, events).get(10)).toMatchObject({ status: 'free' });
  });

  it('counts an event booking two parents once', () => {
    const events = [event(1, [1, 2], 2, 4)];
    expect(statusAt(at(3), rooms, events).get(10)).toMatchObject({ status: 'reserved', eventId: 1 });
  });

  it("prefers the room's own reservation over a parent's", () => {
    const withParent = [room(1), room(3, { parentIds: [1], blockedMessage: 'Riservata' })];
    const events = [event(1, [1], 2, 4), event(2, [3], 3.5, 5)];
    expect(statusAt(at(3.2), withParent, events).get(3)).toMatchObject({ reason: 'prep', eventId: 2, message: null });
  });
});

describe('computeRoomStatuses: overrides', () => {
  const rooms = [room(1)];
  const events = [event(1, [1], 2, 4)];

  it('applies a manual override until removed', () => {
    const s = statusAt(at(3), rooms, events, [override(1)]);
    expect(s.get(1)).toEqual({ status: 'reserved', reason: 'override', message: 'Lavori', eventId: null, changesAt: null });
  });

  it('stops at its expiry time', () => {
    const o = [override(1, { expiresAt: at(1) })];
    expect(statusAt(at(0.5), rooms, events, o).get(1)).toMatchObject({ reason: 'override', changesAt: at(1) });
    expect(statusAt(at(1), rooms, events, o).get(1)).toMatchObject({ status: 'free', reason: 'idle' });
  });

  it('with "until next change", stops when the calculated status changes', () => {
    // Set free during clean-up: lasts until the room would have been free anyway.
    const o = [override(1, { status: 'free', message: null, createdAt: at(4.1), untilNextChange: true })];
    expect(statusAt(at(4.2), rooms, events, o).get(1)).toMatchObject({ status: 'free', reason: 'override', changesAt: at(4.5) });
    expect(statusAt(at(4.6), rooms, events, o).get(1)).toMatchObject({ status: 'free', reason: 'idle' });
  });

  it('with "until next change", also ends at events created after it', () => {
    const o = [override(1, { createdAt: at(0), untilNextChange: true })];
    expect(statusAt(at(1), rooms, [], o).get(1)).toMatchObject({ reason: 'override', changesAt: null });
    expect(statusAt(at(1), rooms, events, o).get(1)).toMatchObject({ reason: 'override', changesAt: at(1.5) });
    expect(statusAt(at(1.6), rooms, events, o).get(1)).toMatchObject({ reason: 'prep' });
  });

  it('takes the earlier of expiry and next change', () => {
    const o = [override(1, { createdAt: at(0), expiresAt: at(3), untilNextChange: true })];
    expect(statusAt(at(1), rooms, events, o).get(1)).toMatchObject({ changesAt: at(1.5) });
  });
});

describe('changeover margins', () => {
  const local = (iso: string) => new Date(iso).getTime();

  it('reserve the room from 14:00 the day before to the next 14:00', () => {
    expect(changeoverMargins(local('2026-10-20T09:00'), local('2026-10-20T18:00'), '14:00')).toEqual({
      prepAt: local('2026-10-19T14:00'),
      releaseAt: local('2026-10-21T14:00'),
    });
  });

  it('free the room the same afternoon after a morning event', () => {
    expect(changeoverMargins(local('2026-10-20T09:00'), local('2026-10-20T12:30'), '14:00').releaseAt).toBe(local('2026-10-20T14:00'));
  });

  it('keep the room reserved between the days of a congress', () => {
    const day1 = event(1, [1], 0, 0, { ...changeoverMargins(local('2026-10-20T09:00'), local('2026-10-20T18:00'), '14:00'), startAt: local('2026-10-20T09:00'), endAt: local('2026-10-20T18:00') });
    const day2 = event(2, [1], 0, 0, { ...changeoverMargins(local('2026-10-21T09:00'), local('2026-10-21T18:00'), '14:00'), startAt: local('2026-10-21T09:00'), endAt: local('2026-10-21T18:00') });
    const night = computeRoomStatuses({ rooms: [room(1)], events: [day1, day2], overrides: [], now: local('2026-10-21T02:00') });
    expect(night.get(1)).toMatchObject({ status: 'reserved', changesAt: local('2026-10-21T09:00') });
  });

  it('use the changeover time set by the superadmin', () => {
    expect(changeoverMargins(local('2026-10-20T09:00'), local('2026-10-20T12:30'), '13:30')).toEqual({
      prepAt: local('2026-10-19T13:30'),
      releaseAt: local('2026-10-20T13:30'),
    });
  });

  it('follow local time across the daylight saving change', () => {
    // Clocks go back on 25 October 2026 in Italy.
    expect(changeoverMargins(local('2026-10-26T09:00'), local('2026-10-26T18:00'), '14:00').prepAt).toBe(local('2026-10-25T14:00'));
  });
});
