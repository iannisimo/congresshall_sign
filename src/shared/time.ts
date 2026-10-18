import { addDays, startOfDay } from 'date-fns';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const DEFAULT_PREP_MINUTES = 30;
export const DEFAULT_DURATION_MINUTES = 60;
export const DEFAULT_CLEANUP_MINUTES = 30;

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
