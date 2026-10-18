import { addDays, set, startOfDay } from 'date-fns';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const DEFAULT_DURATION_MINUTES = 60;

/**
 * Default preparation and clean-up of a congress, around the changeover time ("HH:MM", 14:00 unless the
 * superadmin changes it): the room is reserved from that time on the day before, and until the next
 * changeover after the end (the same day if it ends earlier). Consecutive days of a congress therefore
 * keep the room reserved in between.
 */
export function changeoverMargins(startAt: number, endAt: number, changeoverTime: string): { prepAt: number; releaseAt: number } {
  const [hours = 14, minutes = 0] = changeoverTime.split(':').map(Number);
  const at = (day: Date) => set(day, { hours, minutes }).getTime();
  const prepAt = at(addDays(startOfDay(startAt), -1));
  const sameDay = at(startOfDay(endAt));
  const releaseAt = endAt < sameDay ? sameDay : at(addDays(startOfDay(endAt), 1));
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
