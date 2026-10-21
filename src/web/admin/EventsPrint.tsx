import { isSameDay } from 'date-fns';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { EventBooking, Room, ScheduledEvent } from '../../shared/model.ts';
import { effectiveDayNotes } from '../../shared/events.ts';
import { formatEuros } from '../../shared/money.ts';
import { formatAdminDay, formatAdminShortDay, formatAdminTime } from '../lib/format.ts';
import { useRooms } from './api.ts';
import { fromDateValue } from './dates.ts';
import { printSheet } from './DayPrint.tsx';

/** The time, with its day when that isn't the booking's start day (past midnight). */
function timeAfter(t: number, ref: number): string {
  return isSameDay(t, ref) ? formatAdminTime(t) : `${formatAdminTime(t)} (${formatAdminShortDay(t)})`;
}

/** "—" is how a day says "no note" after a day that had one: it prints as nothing. */
function noteText(text: string | null): string | null {
  return text === null || text.trim() === '—' || text.trim() === '' ? null : text;
}

function Note({ label, text, inherited }: { label: string; text: string | null; inherited: boolean }) {
  const shown = noteText(text);
  return (
    <div>
      <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {label}
        {shown && inherited && <span className="font-normal normal-case"> (come il giorno precedente)</span>}
      </div>
      <p className="whitespace-pre-wrap">{shown ?? '—'}</p>
    </div>
  );
}

function BookingsTable({ bookings, rooms }: { bookings: EventBooking[]; rooms: Map<number, Room> }) {
  return (
    <table className="w-full border-collapse text-left tabular-nums">
      <thead>
        <tr className="border-b border-slate-400 text-xs uppercase">
          <th className="py-1 pr-2">Nome</th>
          <th className="py-1 pr-2">Sale</th>
          <th className="py-1 pr-2">Orario</th>
          <th className="py-1">Pause</th>
        </tr>
      </thead>
      <tbody>
        {bookings.map((b) => (
          <tr key={b.id} className="border-b border-slate-200 align-top">
            <td className="py-1 pr-2">{b.label ?? '—'}</td>
            <td className="py-1 pr-2">{b.roomIds.map((id) => rooms.get(id)?.name ?? '?').join(', ')}</td>
            <td className="py-1 pr-2">
              {formatAdminTime(b.startAt)}–{timeAfter(b.endAt, b.startAt)}
            </td>
            <td className="py-1">
              {b.breaks.length === 0
                ? '—'
                : b.breaks.map((br, i) => (
                    <div key={i}>
                      {br.label} {formatAdminTime(br.startAt)}–{timeAfter(br.endAt, b.startAt)}
                    </div>
                  ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Text height of an A4 page with the 15mm margins (see styles.css), in CSS pixels. */
const PAGE_HEIGHT = ((297 - 30) / 25.4) * 96;
/** Space between events, in CSS pixels (the article's `mb-6`). */
const EVENT_GAP = 24;

/**
 * Events flow one after the other, but one that doesn't fit what is left of the page starts a new one
 * (unless it is already at the top). `heights` are the events' heights at the paper's width.
 */
export function pageBreaks(heights: number[], page = PAGE_HEIGHT): Set<number> {
  const breaks = new Set<number>();
  let used = 0;
  heights.forEach((height, i) => {
    if (used > 0 && used + height > page) {
      breaks.add(i);
      used = 0;
    }
    // An event taller than a page ends part-way down its last one.
    used = (used + height + EVENT_GAP) % page;
  });
  return breaks;
}

/** Full details of the given events, flowing through the pages: for the staff who run them. */
export function EventsPrint({ events, rooms }: { events: ScheduledEvent[]; rooms: Map<number, Room> }) {
  const sheet = useRef<HTMLDivElement>(null);
  const [breaks, setBreaks] = useState<Set<number>>(new Set());
  useLayoutEffect(() => {
    const articles = [...(sheet.current?.querySelectorAll('article') ?? [])];
    setBreaks(pageBreaks(articles.map((a) => a.getBoundingClientRect().height)));
  }, [events, rooms]);
  return createPortal(
    <div ref={sheet} className="print-sheet text-sm text-black">
      {events.length === 0 && <p>Nessun evento.</p>}
      {events.map((event, index) => {
        const reception = noteText(event.receptionNotes);
        const first = fromDateValue(event.startDate) ?? 0;
        const last = fromDateValue(event.endDate) ?? 0;
        return (
          <article key={event.id} className={`mb-6 ${breaks.has(index) ? 'break-before-page' : ''}`}>
            <div className="text-xs font-semibold tracking-wide uppercase">{event.organizerName}</div>
            <h1 className="text-xl font-bold">
              {event.title}
              {!event.visible && <span className="ml-2 rounded border border-black px-1 text-xs uppercase">Bozza</span>}
            </h1>
            {event.subtitle && <div className="text-base">{event.subtitle}</div>}
            <div className="mb-3">
              {event.startDate === event.endDate
                ? formatAdminDay(first)
                : `${formatAdminShortDay(first)} – ${formatAdminShortDay(last)}`}
              {' · '}
              {event.days.length === 1 ? '1 giorno' : `${event.days.length} giorni`}
              {event.bookingNumber && ` · N. prenotazione ${event.bookingNumber}`}
              {event.costCents !== null && ` · Costo ${formatEuros(event.costCents)}`}
              <div>
                Sale riservate dalle {formatAdminTime(event.prepAt)} ({formatAdminShortDay(event.prepAt)}) alle {formatAdminTime(event.releaseAt)} (
                {formatAdminShortDay(event.releaseAt)})
              </div>
            </div>
            {reception && (
              <div className="mb-3">
                <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Reception (tutto l’evento)
                </div>
                <p className="whitespace-pre-wrap">{reception}</p>
              </div>
            )}
            {event.days.map((day, i) => {
              const notes = effectiveDayNotes(event, i);
              return (
                <section key={day.date} className="mb-4 break-inside-avoid border-t border-slate-400 pt-2">
                  <h2 className="mb-1 text-base font-bold first-letter:uppercase">
                    {formatAdminDay(fromDateValue(day.date) ?? 0)}
                  </h2>
                  {day.bookings.length === 0 ? (
                    <p className="mb-2">Nessuna sala</p>
                  ) : (
                    <div className="mb-2">
                      <BookingsTable bookings={day.bookings} rooms={rooms} />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Note label="Reception" text={notes.receptionNotes} inherited={notes.inherited.receptionNotes} />
                    <Note
                      label="Housekeeping"
                      text={notes.housekeepingNotes}
                      inherited={notes.inherited.housekeepingNotes}
                    />
                    <Note label="Ristorante" text={notes.restaurantNotes} inherited={notes.inherited.restaurantNotes} />
                  </div>
                </section>
              );
            })}
          </article>
        );
      })}
    </div>,
    document.body,
  );
}

/**
 * Prints events in detail. Render `sheet` somewhere in the component and call `print(events)`.
 * Used by the events list; the editor's "Stampa" button calls `print([event])`.
 */
export function usePrintEvents(): { print: (events: ScheduledEvent[]) => void; sheet: ReactNode } {
  const rooms = useRooms();
  const [events, setEvents] = useState<ScheduledEvent[] | null>(null);
  const roomMap = new Map((rooms.data ?? []).map((r) => [r.id, r]));
  return {
    print: (list) => printSheet((shown) => setEvents(shown ? list : null)),
    sheet: events && <EventsPrint events={events} rooms={roomMap} />,
  };
}
