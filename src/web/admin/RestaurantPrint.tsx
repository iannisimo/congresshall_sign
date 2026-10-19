import { createPortal } from 'react-dom';
import type { ScheduledEvent } from '../../shared/model.ts';
import { fromDateValue as parseDate } from '../../shared/time.ts';
import { restaurantRows, restaurantWindow } from './restaurantRows.ts';

const fromDateValue = (v: string) => new Date(parseDate(v) ?? 0);
const dayFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
const shortFormat = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });
const fullFormat = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
const stampFormat = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' });

/** The next 14 days for the restaurant: per event, one line per day with hours and breaks. Drafts are marked. */
export function RestaurantPrint({ events, now }: { events: ScheduledEvent[]; now: number }) {
  const { first, last } = restaurantWindow(now);
  const rows = restaurantRows(events, now);
  return createPortal(
    <div className="print-sheet text-sm text-black">
      <h1 className="mb-4 text-xl font-bold">
        Ristorante · dal {shortFormat.format(fromDateValue(first))} al {fullFormat.format(fromDateValue(last))}
      </h1>
      {rows.length === 0 && <p>Nessun evento.</p>}
      {rows.map((event) => (
        <article key={event.id} className="mb-4 break-inside-avoid border-t border-slate-400 pt-3">
          <div className="flex items-center gap-3">
            <div className="text-lg font-bold">{event.organizerName}</div>
            {event.draft && <span className="border-2 border-black px-2 py-0.5 text-xs font-bold tracking-wide">DA CONFERMARE</span>}
          </div>
          <div className="mb-2 text-xs">{event.title}</div>
          <table className="w-full border-collapse tabular-nums">
            <tbody>
              {event.days.map((day) => (
                <tr key={day.date} className="border-t border-slate-300">
                  <td className="w-32 py-1 pr-3 font-medium">{dayFormat.format(fromDateValue(day.date)).replace(',', '')}</td>
                  <td className="w-56 py-1 pr-3">{day.hours}</td>
                  <td className="py-1">{day.breaks.length > 0 ? day.breaks.join(' · ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ))}
      <p className="mt-6 text-[10px] text-slate-600">Stampato il {stampFormat.format(now)}</p>
    </div>,
    document.body,
  );
}
