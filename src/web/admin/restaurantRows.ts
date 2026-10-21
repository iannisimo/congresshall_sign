import { format, startOfDay } from 'date-fns';
import { effectiveDayNotes } from '../../shared/events.ts';
import type { ScheduledEvent } from '../../shared/model.ts';
import { toDateValue } from '../../shared/time.ts';

export interface RestaurantDay {
  /** 'YYYY-MM-DD' */
  date: string;
  /** "09:00–18:00", or each range apart when the bookings don't overlap or touch. */
  hours: string;
  /** Deduplicated "Coffee break 10:30–11:00"; empty when none. */
  breaks: string[];
  /** The day's restaurant note, inherited ones included; null when none ("—" counts as none). */
  notes: string | null;
}

export interface RestaurantEvent {
  id: number;
  organizerName: string;
  title: string;
  /** Drafts are printed too, marked "DA CONFERMARE". */
  draft: boolean;
  days: RestaurantDay[];
}

const time = (t: number) => format(t, 'HH:mm');
const range = (a: number, b: number) => `${time(a)}–${time(b)}`;

/** Merges ranges that overlap or touch. */
export function mergeRanges(ranges: { startAt: number; endAt: number }[]): { startAt: number; endAt: number }[] {
  const out: { startAt: number; endAt: number }[] = [];
  for (const r of [...ranges].sort((a, b) => a.startAt - b.startAt || a.endAt - b.endAt)) {
    const last = out[out.length - 1];
    if (last && r.startAt <= last.endAt) last.endAt = Math.max(last.endAt, r.endAt);
    else out.push({ startAt: r.startAt, endAt: r.endAt });
  }
  return out;
}

/** Today as 'YYYY-MM-DD': the print starts there and has no end. */
export function restaurantFirstDay(now: number): string {
  return toDateValue(startOfDay(now).getTime());
}

/**
 * One entry per event with bookings from today on, by first day; per entry, one row per day from
 * today on that has bookings. Days without bookings and events without any row are left out.
 */
export function restaurantRows(events: ScheduledEvent[], now: number): RestaurantEvent[] {
  const first = restaurantFirstDay(now);
  const out: RestaurantEvent[] = [];
  for (const event of events) {
    const days: RestaurantDay[] = [];
    for (const [index, day] of event.days.entries()) {
      if (day.date < first || day.bookings.length === 0) continue;
      const seen = new Set<string>();
      const breaks = day.bookings
        .flatMap((b) => b.breaks)
        .sort((a, b) => a.startAt - b.startAt || a.endAt - b.endAt)
        .map((br) => `${br.label} ${range(br.startAt, br.endAt)}`)
        .filter((s) => !seen.has(s) && !!seen.add(s));
      const hours = mergeRanges(day.bookings)
        .map((r) => range(r.startAt, r.endAt))
        .join(', ');
      const note = effectiveDayNotes(event, index).restaurantNotes?.trim() ?? '';
      days.push({ date: day.date, hours, breaks, notes: note === '' || note === '—' ? null : note });
    }
    if (days.length > 0) out.push({ id: event.id, organizerName: event.organizerName, title: event.title, draft: !event.visible, days });
  }
  return out.sort((a, b) => a.days[0]!.date.localeCompare(b.days[0]!.date) || a.id - b.id);
}
