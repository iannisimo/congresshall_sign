import { addDays } from 'date-fns';
import type { EventBooking, EventDay, ScheduledEvent, SignEvent } from './model.ts';
import type { EventInput } from './schemas.ts';
import { fromDateValue, toDateValue } from './time.ts';

// Helpers on the nested event shape, shared by the server, the sign and the admin area.

/** One SignEvent per booking of every day: what the sign, the timeline and the status engine work on. */
export function flattenEvent(event: ScheduledEvent): SignEvent[] {
  return event.days.flatMap((day) =>
    day.bookings.map((booking) => ({
      id: booking.id,
      eventId: event.id,
      date: day.date,
      organizerId: event.organizerId,
      organizerName: event.organizerName,
      logoId: event.logoId,
      title: event.title,
      subtitle: event.subtitle,
      roomIds: booking.roomIds,
      prepAt: booking.prepAt,
      startAt: booking.startAt,
      endAt: booking.endAt,
      releaseAt: booking.releaseAt,
      breaks: booking.breaks,
      visible: event.visible,
    })),
  );
}

export function flattenEvents(events: ScheduledEvent[]): SignEvent[] {
  return events.flatMap(flattenEvent);
}

/** The saved event as an input again, e.g. to flip its visibility from a list. */
export function eventToInput(event: ScheduledEvent): EventInput {
  return {
    organizerId: event.organizerId,
    logoId: event.logoId,
    title: event.title,
    subtitle: event.subtitle,
    visible: event.visible,
    receptionNotes: event.receptionNotes,
    days: event.days.map((day) => ({
      date: day.date,
      receptionNotes: day.receptionNotes,
      housekeepingNotes: day.housekeepingNotes,
      bookings: day.bookings.map((b) => ({
        label: b.label,
        roomIds: [...b.roomIds],
        prepAt: b.prepAt,
        startAt: b.startAt,
        endAt: b.endAt,
        releaseAt: b.releaseAt,
        breaks: b.breaks.map((br) => ({ ...br })),
      })),
    })),
  };
}

type NotesDay = Pick<EventDay, 'receptionNotes' | 'housekeepingNotes'>;

export interface EffectiveDayNotes {
  receptionNotes: string | null;
  housekeepingNotes: string | null;
  /** True when the note is the previous day's, because this day's is empty. */
  inherited: { receptionNotes: boolean; housekeepingNotes: boolean };
}

/**
 * The per-day notes of a day, with "same as previous" resolved: on a day after the first, a null note
 * means the previous day's (recursively). On the first day null means no note. A day that wants no note
 * after a day with one writes "—", which is a note like any other.
 */
export function effectiveDayNotes(event: { days: NotesDay[] }, dayIndex: number): EffectiveDayNotes {
  const resolve = (field: 'receptionNotes' | 'housekeepingNotes') => {
    let i = dayIndex;
    while (i > 0 && event.days[i]?.[field] == null) i -= 1;
    return { value: event.days[i]?.[field] ?? null, inherited: i !== dayIndex };
  };
  const reception = resolve('receptionNotes');
  const housekeeping = resolve('housekeepingNotes');
  return {
    receptionNotes: reception.value,
    housekeepingNotes: housekeeping.value,
    inherited: { receptionNotes: reception.inherited, housekeepingNotes: housekeeping.inherited },
  };
}

/** Every date from startDate to endDate included, 'YYYY-MM-DD'. Empty if the range is invalid. */
export function eventDates(startDate: string, endDate: string): string[] {
  const start = fromDateValue(startDate);
  const end = fromDateValue(endDate);
  if (start === null || end === null || end < start) return [];
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1).getTime()) dates.push(toDateValue(d));
  return dates;
}

/**
 * The event moved by whole days: dates, bookings and breaks, keeping local clock times across a
 * daylight-saving change.
 */
export function shiftEvent(input: EventInput, days: number): EventInput {
  const move = (t: number) => addDays(t, days).getTime();
  return {
    ...input,
    days: input.days.map((day) => ({
      ...day,
      date: toDateValue(addDays(fromDateValue(day.date) ?? 0, days).getTime()),
      bookings: day.bookings.map((b) => ({
        ...b,
        prepAt: move(b.prepAt),
        startAt: move(b.startAt),
        endAt: move(b.endAt),
        releaseAt: move(b.releaseAt),
        breaks: b.breaks.map((br) => ({ ...br, startAt: move(br.startAt), endAt: move(br.endAt) })),
      })),
    })),
  };
}

/** Earliest start and latest end of a day's bookings, or null if it has none. */
export function dayHours(day: { bookings: Pick<EventBooking, 'startAt' | 'endAt'>[] }): { startAt: number; endAt: number } | null {
  if (day.bookings.length === 0) return null;
  return {
    startAt: Math.min(...day.bookings.map((b) => b.startAt)),
    endAt: Math.max(...day.bookings.map((b) => b.endAt)),
  };
}
