import { addDays, format, isValid, parse, startOfDay } from 'date-fns';
import type { KeyboardEvent } from 'react';

// Values for <input type="date|time|datetime-local">, always in local time.

export const toDateValue = (t: number) => format(t, 'yyyy-MM-dd');
export const toTimeValue = (t: number) => format(t, 'HH:mm');
export const toDateTimeValue = (t: number) => format(t, "yyyy-MM-dd'T'HH:mm");

function parsed(value: string, pattern: string): number | null {
  const date = parse(value, pattern, new Date());
  return isValid(date) ? date.getTime() : null;
}

export const fromDateValue = (value: string) => parsed(value, 'yyyy-MM-dd');
export const fromDateTimeValue = (value: string) => parsed(value, "yyyy-MM-dd'T'HH:mm");
export const atTime = (date: string, time: string) => parsed(`${date} ${time}`, 'yyyy-MM-dd HH:mm');

export const todayValue = () => toDateValue(Date.now());

/** Date field shortcuts (ADMIN-5): "o" for today (oggi), "d" for tomorrow (domani). Returns the new value. */
export function dateShortcut(e: KeyboardEvent<HTMLInputElement>): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const key = e.key.toLowerCase();
  if (key !== 'o' && key !== 'd') return null;
  e.preventDefault();
  const today = startOfDay(Date.now());
  return toDateValue((key === 'o' ? today : addDays(today, 1)).getTime());
}
