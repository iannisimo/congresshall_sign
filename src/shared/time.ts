import { addDays, format, isValid, parse, set, startOfDay } from 'date-fns';
import type { Settings } from './model.ts';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const DEFAULT_DURATION_MINUTES = 60;

/** The settings that place the default preparation and clean-up. */
export type ChangeoverSettings = Pick<Settings, 'prepTime' | 'cleanupTime' | 'cleanupMinGapHours'>;

/**
 * Default preparation and clean-up of a congress ("HH:MM" times set by the superadmin, 14:00 by default):
 * the room is reserved from the preparation time on the day before, and until the next clean-up time after
 * the end (the same day if it ends at least `cleanupMinGapHours` earlier, so there is time to tidy up).
 * Consecutive days of a congress therefore keep the room reserved in between.
 */
export function changeoverMargins(
  startAt: number,
  endAt: number,
  { prepTime, cleanupTime, cleanupMinGapHours }: ChangeoverSettings,
): { prepAt: number; releaseAt: number } {
  const at = (day: Date, time: string) => {
    const [hours = 14, minutes = 0] = time.split(':').map(Number);
    return set(day, { hours, minutes }).getTime();
  };
  const prepAt = at(addDays(startOfDay(startAt), -1), prepTime);
  const sameDay = at(startOfDay(endAt), cleanupTime);
  const releaseAt = endAt <= sameDay - cleanupMinGapHours * HOUR ? sameDay : at(addDays(startOfDay(endAt), 1), cleanupTime);
  return { prepAt, releaseAt };
}

/** Whether the time of day of `t` is in [from, until), two "HH:MM" times; the range may span midnight. */
export function inDailyRange(t: number, from: string, until: string): boolean {
  const minutes = (time: string) => {
    const [h = 0, m = 0] = time.split(':').map(Number);
    return h * 60 + m;
  };
  const date = new Date(t);
  const now = date.getHours() * 60 + date.getMinutes();
  const start = minutes(from);
  const end = minutes(until);
  return start <= end ? now >= start && now < end : now >= start || now < end;
}

/** How far ahead the sign gets events: enough to keep working through a long outage. */
export const DISPLAY_WINDOW_DAYS = 8;

/**
 * Events the sign receives: everything overlapping [start of today, start of today + 8 days).
 * Depends only on the day, so the snapshot only changes when data changes or the day does.
 */
export function displayWindow(now: number): { from: number; to: number } {
  const from = startOfDay(now);
  return { from: from.getTime(), to: addDays(from, DISPLAY_WINDOW_DAYS).getTime() };
}

/** Local 'YYYY-MM-DD' of a time. */
export const toDateValue = (t: number) => format(t, 'yyyy-MM-dd');

/** Start of the local day of a 'YYYY-MM-DD', or null if it is not a valid date. */
export function fromDateValue(value: string): number | null {
  const date = parse(value, 'yyyy-MM-dd', new Date());
  return isValid(date) ? date.getTime() : null;
}
