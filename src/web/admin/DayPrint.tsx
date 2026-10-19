import { isSameDay } from 'date-fns';
import { createPortal, flushSync } from 'react-dom';
import { effectiveDayNotes } from '../../shared/events.ts';
import type { EventBreak, Room, ScheduledEvent } from '../../shared/model.ts';
import { formatAdminDay, formatAdminShortDay, formatAdminTime } from '../lib/format.ts';

/** The time, with its day when that isn't the printed one (bookings past midnight). */
function timeOn(t: number, day: number): string {
  return isSameDay(t, day) ? formatAdminTime(t) : `${formatAdminTime(t)} (${formatAdminShortDay(t)})`;
}

/** A note as written; empty, or the "—" that means "nothing today", is no note. */
export function noteText(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  return trimmed && trimmed !== '—' ? trimmed : null;
}

function Notes({ label, text, inherited }: { label: string; text: string | null; inherited?: boolean }) {
  const note = noteText(text);
  return (
    <div>
      <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</div>
      <p className="whitespace-pre-wrap">{note ?? '—'}</p>
      {note && inherited && <p className="text-[0.65rem] text-slate-500">(come il giorno precedente)</p>}
    </div>
  );
}

function breakText(breaks: EventBreak[]): string {
  return breaks.map((b) => `${b.label} ${formatAdminTime(b.startAt)}–${formatAdminTime(b.endAt)}`).join(' · ');
}

/** Renders the sheet with setShown, opens the print dialog, and takes the sheet away once it closes. */
export function printSheet(setShown: (shown: boolean) => void): void {
  flushSync(() => setShown(true));
  window.addEventListener('afterprint', () => setShown(false), { once: true });
  window.print();
}

/**
 * A day's events for the venue staff, on paper (`date` is 'YYYY-MM-DD'; events without that day are
 * skipped). While printing, the rest of the page is hidden (see styles.css).
 */
export function DayPrint({ day, date, events, rooms }: { day: number; date: string; events: ScheduledEvent[]; rooms: Map<number, Room> }) {
  const entries = events.flatMap((event) => {
    const index = event.days.findIndex((d) => d.date === date);
    return index < 0 ? [] : [{ event, day: event.days[index]!, notes: effectiveDayNotes(event, index) }];
  });
  return createPortal(
    <div className="print-sheet text-sm text-black">
      <h1 className="mb-4 text-xl font-bold first-letter:uppercase">{formatAdminDay(day)}</h1>
      {entries.length === 0 && <p>Nessun evento.</p>}
      {entries.map(({ event, day: eventDay, notes }) => (
        <article key={event.id} className="mb-4 break-inside-avoid border-t border-slate-400 pt-3">
          <div className="text-xs font-semibold tracking-wide uppercase">{event.organizerName}</div>
          <h2 className="text-base font-bold">{event.title}</h2>
          {event.bookingNumber && <div className="text-xs">N. prenotazione {event.bookingNumber}</div>}
          <div className="mb-2 space-y-0.5 tabular-nums">
            {eventDay.bookings.length === 0 && <div>Nessuna sala</div>}
            {eventDay.bookings.map((b) => (
              <div key={b.id}>
                {b.label && <span className="font-semibold">{b.label}: </span>}
                {timeOn(b.startAt, day)}–{timeOn(b.endAt, day)}
                {' · '}
                {b.roomIds.map((id) => rooms.get(id)?.name ?? '?').join(', ')}
                {b.breaks.length > 0 && <span className="text-slate-600"> · {breakText(b.breaks)}</span>}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Notes label="Reception (tutto l’evento)" text={event.receptionNotes} />
            <Notes label="Reception (oggi)" text={notes.receptionNotes} inherited={notes.inherited.receptionNotes} />
            <Notes label="Housekeeping" text={notes.housekeepingNotes} inherited={notes.inherited.housekeepingNotes} />
          </div>
        </article>
      ))}
    </div>,
    document.body,
  );
}
