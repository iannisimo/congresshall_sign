import { isSameDay } from 'date-fns';
import { createPortal, flushSync } from 'react-dom';
import type { Room, ScheduledEvent } from '../../shared/model.ts';
import { formatAdminDay, formatAdminShortDay, formatAdminTime } from '../lib/format.ts';

/** The time, with its day when that isn't the printed one (events past midnight). */
function timeOn(t: number, day: number): string {
  return isSameDay(t, day) ? formatAdminTime(t) : `${formatAdminTime(t)} (${formatAdminShortDay(t)})`;
}

function Notes({ label, text }: { label: string; text: string | null }) {
  return (
    <div>
      <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</div>
      <p className="whitespace-pre-wrap">{text ?? '—'}</p>
    </div>
  );
}

/** Renders the sheet with setShown, opens the print dialog, and takes the sheet away once it closes. */
export function printSheet(setShown: (shown: boolean) => void): void {
  flushSync(() => setShown(true));
  window.addEventListener('afterprint', () => setShown(false), { once: true });
  window.print();
}

/** A day's events for the venue staff, on paper. While printing, the rest of the page is hidden (see styles.css). */
export function DayPrint({ day, events, rooms }: { day: number; events: ScheduledEvent[]; rooms: Map<number, Room> }) {
  return createPortal(
    <div className="print-sheet text-sm text-black">
      <h1 className="mb-4 text-xl font-bold first-letter:uppercase">{formatAdminDay(day)}</h1>
      {events.length === 0 && <p>Nessun evento.</p>}
      {events.map((event) => (
        <article key={event.id} className="mb-4 break-inside-avoid border-t border-slate-400 pt-3">
          <div className="text-xs font-semibold tracking-wide uppercase">{event.organizerName}</div>
          <h2 className="text-base font-bold">{event.title}</h2>
          <div className="mb-2 tabular-nums">
            {formatAdminShortDay(event.startAt)}, {timeOn(event.startAt, day)}–{timeOn(event.endAt, day)}
            {' · '}
            {event.roomIds.map((id) => rooms.get(id)?.name ?? '?').join(', ')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Notes label="Reception" text={event.receptionNotes} />
            <Notes label="Housekeeping" text={event.housekeepingNotes} />
          </div>
        </article>
      ))}
    </div>,
    document.body,
  );
}
