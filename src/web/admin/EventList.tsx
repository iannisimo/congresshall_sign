import { useMutation, useQuery } from '@tanstack/react-query';
import { startOfDay } from 'date-fns';
import { Copy, EyeOff, Pencil, Printer, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { Room, ScheduledEvent } from '../../shared/model.ts';
import { eventDates } from '../../shared/events.ts';
import { formatEuros } from '../../shared/money.ts';
import { Logo } from '../sign/parts.tsx';
import { printSheet } from './DayPrint.tsx';
import { RestaurantPrint } from './RestaurantPrint.tsx';
import { api, errorMessage, refreshSchedule, useRooms } from './api.ts';
import { fromDateValue as parseDate, todayValue } from './dates.ts';
import { usePrintEvents } from './EventsPrint.tsx';
import { Badge, Button, buttonClass, Card, ErrorNote, inputClass, PageLoading, useFeedback } from './ui.tsx';

/** Every event ending today or later, live ones included. */
const useUpcomingEvents = (from: number, enabled: boolean) =>
  useQuery({ enabled, queryKey: ['events', from, 'open'], queryFn: () => api<ScheduledEvent[]>(`/events?from=${from}`) });

/** Every event that started before `to`; the page keeps those that are over. */
const usePastEvents = (to: number, enabled: boolean) =>
  useQuery({ enabled, queryKey: ['events', 0, to, 'past'], queryFn: () => api<ScheduledEvent[]>(`/events?from=0&to=${to}`) });

const fromDateValue = (v: string) => new Date(parseDate(v) ?? 0);
const dayFormat = new Intl.DateTimeFormat('it-IT', { day: 'numeric' });
const dayMonthFormat = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });
const fullFormat = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
const monthFormat = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });

/** "20–22 ott 2026 · 3 giorni", "20 ott – 2 nov 2026 · 14 giorni" or "20 ott 2026". */
function datesText(event: ScheduledEvent): string {
  const a = fromDateValue(event.startDate);
  const b = fromDateValue(event.endDate);
  if (event.startDate === event.endDate) return fullFormat.format(a);
  const count = eventDates(event.startDate, event.endDate).length;
  const sameYear = a.getFullYear() === b.getFullYear();
  const range =
    sameYear && a.getMonth() === b.getMonth()
      ? `${dayFormat.format(a)}–${fullFormat.format(b)}`
      : sameYear
        ? `${dayMonthFormat.format(a)} – ${fullFormat.format(b)}`
        : `${fullFormat.format(a)} – ${fullFormat.format(b)}`;
  return `${range} · ${count} giorni`;
}

/** Rooms used across all days, in display order, once each. */
function roomsText(event: ScheduledEvent, rooms: Room[]): string {
  const used = new Set(event.days.flatMap((d) => d.bookings.flatMap((b) => b.roomIds)));
  return rooms
    .filter((r) => used.has(r.id))
    .map((r) => r.name)
    .join(', ');
}

function EventRow({
  event,
  rooms,
  today,
  onPrintDetails,
}: {
  event: ScheduledEvent;
  rooms: Room[];
  today: string;
  /** Missing in the past events, which can't be printed. */
  onPrintDetails?: (events: ScheduledEvent[]) => void;
}) {
  const { confirm, toast } = useFeedback();
  const remove = useMutation({
    mutationFn: () => api(`/events/${event.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refreshSchedule();
      toast('Evento eliminato');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const live = event.startDate <= today && today <= event.endDate;
  // Today's tab when the event is live, else its first.
  const day = live ? today : event.startDate;
  const edit = `/admin/events/${event.id}?day=${day}&d=${day}`;
  const roomNames = roomsText(event, rooms);

  return (
    <li className={`flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center ${event.visible ? '' : 'border-l-4 border-amber-400 bg-amber-50/60 pl-3'}`}>
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <Logo logoId={event.logoId} name={event.organizerName} className="size-14 ring-1 ring-slate-200" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold tracking-wide text-brand-800 uppercase">{event.organizerName}</div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={edit} className="truncate font-semibold text-slate-900 hover:underline">
              {event.title}
            </Link>
            {live && <Badge tone="brand">In corso</Badge>}
            {!event.visible && (
              <Badge tone="amber">
                <EyeOff className="size-3.5" />
                Bozza
              </Badge>
            )}
          </div>
          {event.subtitle && <div className="truncate text-sm text-slate-500">{event.subtitle}</div>}
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-600">
            <span className="font-medium">{datesText(event)}</span>
            {roomNames && <span className="text-slate-500">{roomNames}</span>}
            {event.bookingNumber && <span className="text-xs text-slate-400">N. {event.bookingNumber}</span>}
            {event.costCents !== null && <span className="text-xs text-slate-400">{formatEuros(event.costCents)}</span>}
          </div>
        </div>
      </div>
      <div className="flex gap-1 self-end sm:self-auto">
        {onPrintDetails ? (
          <>
            <Link to={edit} className={buttonClass('ghost', 'sm')} title="Modifica">
              <Pencil className="size-4" />
              <span className="sm:hidden lg:inline">Modifica</span>
            </Link>
            <Link to={`/admin/events/${event.id}/clone`} className={buttonClass('ghost', 'sm')} title="Duplica">
              <Copy className="size-4" />
            </Link>
          </>
        ) : (
          // Past events are mostly duplicated, so that comes first.
          <>
            <Link to={`/admin/events/${event.id}/clone`} className={buttonClass('ghost', 'sm')} title="Duplica">
              <Copy className="size-4" />
              <span className="sm:hidden lg:inline">Duplica</span>
            </Link>
            <Link to={edit} className={buttonClass('ghost', 'sm')} title="Modifica">
              <Pencil className="size-4" />
            </Link>
          </>
        )}
        {onPrintDetails && (
          <Button size="sm" variant="ghost" title="Stampa dettagli" onClick={() => onPrintDetails([event])}>
            <Printer className="size-4" />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          title="Elimina"
          busy={remove.isPending}
          onClick={async () => {
            if (await confirm(`Eliminare «${event.title}»?`, { confirmLabel: 'Elimina', danger: true })) remove.mutate();
          }}
        >
          <Trash2 className="size-4 text-red-600" />
        </Button>
      </div>
    </li>
  );
}

/**
 * Upcoming and running events, grouped by month. The print hooks are no-ops until the print tasks
 * (restaurant, details) provide them.
 */
export default function EventList({
  past = false,
  onPrintRestaurant,
  onPrintDetails,
}: {
  /** Events that are over, most recent first and without the prints. */
  past?: boolean;
  onPrintRestaurant?: () => void;
  /** Gets the events to print: all those shown, or the one of the row. */
  onPrintDetails?: (events: ScheduledEvent[]) => void;
}) {
  const detailsPrinter = usePrintEvents();
  const printDetails = onPrintDetails ?? detailsPrinter.print;
  const from = startOfDay(Date.now()).getTime();
  const today = todayValue();
  const upcoming = useUpcomingEvents(from, !past);
  const earlier = usePastEvents(from, past);
  const events = past ? earlier : upcoming;
  const rooms = useRooms();
  const [filter, setFilter] = useState('');
  const [hideDrafts, setHideDrafts] = useState(false);
  const [restaurantShown, setRestaurantShown] = useState(false);

  const shown = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return (events.data ?? [])
      .filter((e) => (past ? e.endDate < today : e.endDate >= today))
      .filter((e) => !hideDrafts || e.visible)
      .filter((e) => !term || e.organizerName.toLowerCase().includes(term) || e.title.toLowerCase().includes(term) || (e.bookingNumber ?? '').toLowerCase().includes(term))
      .sort((a, b) => (past ? b.startDate.localeCompare(a.startDate) || b.id - a.id : a.startDate.localeCompare(b.startDate) || a.id - b.id));
  }, [events.data, filter, hideDrafts, today, past]);

  const groups = useMemo(() => {
    const out: { label: string; events: ScheduledEvent[] }[] = [];
    for (const event of shown) {
      const label = monthFormat.format(fromDateValue(event.startDate));
      const last = out[out.length - 1];
      if (last?.label === label) last.events.push(event);
      else out.push({ label, events: [event] });
    }
    return out;
  }, [shown]);

  const sortedRooms = useMemo(() => [...(rooms.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [rooms.data]);

  if (events.isPending || rooms.isPending) return <PageLoading />;
  if (events.isError) return <ErrorNote>{errorMessage(events.error)}</ErrorNote>;

  return (
    <div className="space-y-5">
      {!past && detailsPrinter.sheet}
      {!past && restaurantShown && <RestaurantPrint events={events.data} now={Date.now()} />}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold text-slate-900">{past ? 'Eventi passati' : 'Eventi'}</h1>
        <input
          type="search"
          className={`${inputClass} max-w-xs`}
          placeholder="Cerca organizzatore, titolo o n. prenotazione"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={hideDrafts} onChange={(e) => setHideDrafts(e.target.checked)} />
          Nascondi bozze
        </label>
        {!past && (
          <>
            <Button variant="secondary" onClick={onPrintRestaurant ?? (() => printSheet(setRestaurantShown))}>
              <Printer className="size-4" />
              Stampa ristorante (14 gg)
            </Button>
            <Button variant="secondary" onClick={() => printDetails(shown)}>
              <Printer className="size-4" />
              Stampa dettagli
            </Button>
          </>
        )}
      </div>
      {groups.length === 0 ? (
        <Card className="px-4 py-10 text-center text-slate-500">{past ? 'Nessun evento passato' : 'Nessun evento in programma'}</Card>
      ) : (
        groups.map((group) => (
          <section key={group.label}>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">{group.label}</h2>
            <Card>
              <ul className="divide-y divide-slate-100">
                {group.events.map((event) => (
                  <EventRow key={event.id} event={event} rooms={sortedRooms} today={today} onPrintDetails={past ? undefined : printDetails} />
                ))}
              </ul>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
