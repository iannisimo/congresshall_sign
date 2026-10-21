import { addDays, set, startOfDay } from 'date-fns';
import type { SignEvent } from '../../shared/model.ts';

/** Days after today listed under "Coming up". */
export const COMING_UP_DAYS = 3;

export interface DayGroup {
  day: number;
  events: SignEvent[];
}

export interface SignView {
  /** Start of the day the big cards are about; today, or the next day with events. */
  featuredDay: number | null;
  /** Big cards: events running or still to come that day. */
  featured: SignEvent[];
  /** The following days, as a compact list. */
  comingUp: DayGroup[];
}

const byStart = (a: SignEvent, b: SignEvent) => a.startAt - b.startAt || a.id - b.id;

/** The time of day, "HH:MM", from which the big sign sticks to today's events. */
export const DEFAULT_BIG_FROM = '09:00';

/** `?from=HH:MM` of the big sign; absent or malformed means the default. */
export function parseFrom(search: string): string {
  const value = new URLSearchParams(search).get('from')?.trim() ?? '';
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  return match && Number(match[1]) < 24 && Number(match[2]) < 60 ? `${match[1]!.padStart(2, '0')}:${match[2]}` : DEFAULT_BIG_FROM;
}

/** Whether `now` is at or after the "HH:MM" time of its day. */
export function isFromTime(now: number, from: string): boolean {
  const [hours = 0, minutes = 0] = from.split(':').map(Number);
  return now >= set(now, { hours, minutes, seconds: 0, milliseconds: 0 }).getTime();
}

/** Splits the events guests still care about into the big cards and the list of the next days. */
export function buildSignView(events: SignEvent[], now: number, todayOnly?: { listed: boolean }): SignView {
  const today = startOfDay(now).getTime();
  if (todayOnly) {
    const tomorrow = addDays(today, 1).getTime();
    // Before the set time only what is already live counts; from then on, all of what is left of today.
    const shown = (e: SignEvent) => e.endAt > now && e.startAt < tomorrow && (todayOnly.listed || e.startAt <= now);
    const featured = events.filter((e) => e.visible && shown(e)).sort(byStart);
    return { featuredDay: featured.length > 0 ? today : null, featured, comingUp: [] };
  }
  const horizon = addDays(today, 1 + COMING_UP_DAYS).getTime();
  const pending = events.filter((e) => e.visible && e.endAt > now && e.startAt < horizon).sort(byStart);

  const first = pending[0];
  if (!first) return { featuredDay: null, featured: [], comingUp: [] };

  // Today if anything is left today, otherwise the next day with events.
  const featuredDay = Math.max(today, startOfDay(first.startAt).getTime());
  const nextDay = addDays(featuredDay, 1).getTime();
  const featured = pending.filter((e) => e.startAt < nextDay);

  const groups = new Map<number, SignEvent[]>();
  for (const event of pending.filter((e) => e.startAt >= nextDay)) {
    const day = startOfDay(event.startAt).getTime();
    groups.set(day, [...(groups.get(day) ?? []), event]);
  }
  return {
    featuredDay,
    featured,
    comingUp: [...groups].map(([day, list]) => ({ day, events: mergeByEvent(list) })),
  };
}

/** One line per event: its bookings of the day become one, starting at the earliest, rooms deduplicated. */
function mergeByEvent(bookings: SignEvent[]): SignEvent[] {
  const merged = new Map<number, SignEvent>();
  for (const b of bookings) {
    const seen = merged.get(b.eventId);
    merged.set(
      b.eventId,
      seen
        ? {
            ...seen,
            roomIds: [...new Set([...seen.roomIds, ...b.roomIds])],
            endAt: Math.max(seen.endAt, b.endAt),
            releaseAt: Math.max(seen.releaseAt, b.releaseAt),
          }
        : b,
    );
  }
  return [...merged.values()];
}
