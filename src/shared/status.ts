import type { Override, Room, RoomStatusKind, SignEvent } from './model.ts';

// Room status is never stored: it is calculated from the schedule, the overrides and the clock.
// The sign runs this every second, so it stays right while offline; the server needs no timers.

export type StatusReason = 'idle' | 'prep' | 'event' | 'cleanup' | 'parent' | 'override';

export interface RoomState {
  status: RoomStatusKind;
  reason: StatusReason;
  /** Custom text: the override message, or the sub-room's blocked message. */
  message: string | null;
  /** Event behind the status (the room's own or a parent's). */
  eventId: number | null;
  /** When what the sign shows for this room changes next, if known. */
  changesAt: number | null;
}

export type EventPhase = 'upcoming' | 'prep' | 'live' | 'cleanup' | 'over';

export function eventPhase(event: SignEvent, now: number): EventPhase {
  if (now < event.prepAt) return 'upcoming';
  if (now < event.startAt) return 'prep';
  if (now < event.endAt) return 'live';
  if (now < event.releaseAt) return 'cleanup';
  return 'over';
}

type Calculated = Omit<RoomState, 'changesAt'>;

const IDLE: Calculated = { status: 'free', reason: 'idle', message: null, eventId: null };
const STRENGTH: Record<RoomStatusKind, number> = { free: 0, reserved: 1, occupied: 2 };

interface RoomSchedule {
  room: Room;
  /** Visible events booking this room, by start time. */
  own: SignEvent[];
  /** Visible events booking one of its parent rooms. */
  parent: SignEvent[];
  /** Every time the calculated status may change, ascending. */
  boundaries: number[];
}

function ownState(event: SignEvent, t: number): Calculated | null {
  const phase = eventPhase(event, t);
  switch (phase) {
    case 'prep':
      return { status: 'reserved', reason: 'prep', message: null, eventId: event.id };
    case 'live':
      return { status: 'occupied', reason: 'event', message: null, eventId: event.id };
    case 'cleanup':
      return { status: 'reserved', reason: 'cleanup', message: null, eventId: event.id };
    default:
      return null;
  }
}

function parentState(room: Room, event: SignEvent, t: number): Calculated | null {
  if (t < event.startAt || t >= event.endAt) return null;
  return { status: 'reserved', reason: 'parent', message: room.blockedMessage, eventId: event.id };
}

function calculate(schedule: RoomSchedule, t: number): Calculated {
  // Strictly stronger wins, so on a tie the room's own events beat its parents'.
  let best = IDLE;
  for (const event of schedule.own) {
    const state = ownState(event, t);
    if (state && STRENGTH[state.status] > STRENGTH[best.status]) best = state;
  }
  for (const event of schedule.parent) {
    const state = parentState(schedule.room, event, t);
    if (state && STRENGTH[state.status] > STRENGTH[best.status]) best = state;
  }
  return best;
}

type Same = (a: Calculated, b: Calculated) => boolean;

/** Same cause: used to end "until next change" overrides. */
const sameCause: Same = (a, b) => a.status === b.status && a.reason === b.reason && a.eventId === b.eventId;
/** Same look on the sign: used for the "→ time" hint. */
const sameLook: Same = (a, b) => a.status === b.status && a.message === b.message;

function nextChange(schedule: RoomSchedule, after: number, same: Same): number | null {
  const base = calculate(schedule, after);
  for (const t of schedule.boundaries) {
    if (t > after && !same(calculate(schedule, t), base)) return t;
  }
  return null;
}

/** When an override stops applying, or null if it applies until removed. */
function overrideEnd(schedule: RoomSchedule, override: Override): number | null {
  let end = override.expiresAt;
  if (override.untilNextChange) {
    const change = nextChange(schedule, override.createdAt, sameCause);
    if (change !== null && (end === null || change < end)) end = change;
  }
  return end;
}

function buildSchedules(rooms: Room[], events: SignEvent[]): RoomSchedule[] {
  const byRoom = new Map<number, SignEvent[]>();
  const visible = events.filter((e) => e.visible).sort((a, b) => a.startAt - b.startAt || a.id - b.id);
  for (const event of visible) {
    for (const roomId of event.roomIds) {
      const list = byRoom.get(roomId);
      if (list) list.push(event);
      else byRoom.set(roomId, [event]);
    }
  }
  return rooms.map((room) => {
    const own = byRoom.get(room.id) ?? [];
    const parentById = new Map<number, SignEvent>();
    for (const parentId of room.parentIds) {
      for (const event of byRoom.get(parentId) ?? []) parentById.set(event.id, event);
    }
    const parent = [...parentById.values()];
    const times = new Set<number>();
    for (const e of own) [e.prepAt, e.startAt, e.endAt, e.releaseAt].forEach((t) => times.add(t));
    for (const e of parent) [e.startAt, e.endAt].forEach((t) => times.add(t));
    return { room, own, parent, boundaries: [...times].sort((a, b) => a - b) };
  });
}

export function computeRoomStatuses(input: {
  rooms: Room[];
  events: SignEvent[];
  overrides: Override[];
  now: number;
}): Map<number, RoomState> {
  const { now } = input;
  const overrides = new Map(input.overrides.map((o) => [o.roomId, o]));
  const result = new Map<number, RoomState>();

  for (const schedule of buildSchedules(input.rooms, input.events)) {
    const override = overrides.get(schedule.room.id);
    if (override) {
      const end = overrideEnd(schedule, override);
      if (end === null || now < end) {
        result.set(schedule.room.id, {
          status: override.status,
          reason: 'override',
          message: override.message,
          eventId: null,
          changesAt: end,
        });
        continue;
      }
    }
    result.set(schedule.room.id, {
      ...calculate(schedule, now),
      changesAt: nextChange(schedule, now, sameLook),
    });
  }
  return result;
}
