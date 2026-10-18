import { useMutation } from '@tanstack/react-query';
import { addDays, isSameDay, isSameWeek, isToday, startOfDay, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, Copy, Eye, EyeOff, MapPin, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { Room, ScheduledEvent } from '../../shared/model.ts';
import { formatAdminDay, formatAdminShortDay, formatAdminTime, formatAdminWeek } from '../lib/format.ts';
import { Logo } from '../sign/parts.tsx';
import { api, errorMessage, refreshSchedule, useEvents, useRooms } from './api.ts';
import { DayPrint, printSheet } from './DayPrint.tsx';
import { dateShortcut, fromDateValue, toDateValue } from './dates.ts';
import { RoomStatusPanel } from './RoomStatusPanel.tsx';
import { Timeline } from './Timeline.tsx';
import { Badge, Button, buttonClass, Card, ErrorNote, inputClass, PageLoading, useFeedback } from './ui.tsx';

/** The event as API input, e.g. to flip its visibility. */
export function toInput(event: ScheduledEvent) {
  const { id: _id, organizerName: _name, ...input } = event;
  return input;
}

/** When the room is held around the event, with the day when it isn't the event's. */
function heldText(event: ScheduledEvent): string {
  if (event.prepAt === event.startAt && event.releaseAt === event.endAt) return 'nessuna preparazione né riordino';
  const at = (t: number) => (isSameDay(t, event.startAt) ? formatAdminTime(t) : `${formatAdminTime(t)} di ${formatAdminShortDay(t)}`);
  return `sala riservata dalle ${at(event.prepAt)} alle ${at(event.releaseAt)}`;
}

function EventRow({ event, rooms, day }: { event: ScheduledEvent; rooms: Map<number, Room>; day: string }) {
  const { confirm, toast } = useFeedback();
  const remove = useMutation({
    mutationFn: () => api(`/events/${event.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refreshSchedule();
      toast('Evento eliminato');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const toggle = useMutation({
    mutationFn: () =>
      api(`/events/${event.id}`, {
        method: 'PUT',
        json: { event: { ...toInput(event), visible: !event.visible }, allowConflicts: true },
      }),
    onSuccess: () => refreshSchedule(),
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const roomNames = event.roomIds.map((id) => rooms.get(id)?.name ?? '?').join(', ');
  return (
    <li
      className={`flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center ${event.visible ? '' : 'border-l-4 border-amber-400 bg-amber-50/60 pl-3'}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <Logo logoId={event.logoId} name={event.organizerName} className="size-14 ring-1 ring-slate-200" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold tracking-wide text-brand-800 uppercase">{event.organizerName}</div>
          <div className="flex items-center gap-2">
            <Link to={`/admin/events/${event.id}?d=${day}`} className="truncate font-semibold text-slate-900 hover:underline">
              {event.title}
            </Link>
            {!event.visible && (
              <Badge tone="amber">
                <EyeOff className="size-3.5" />
                Bozza · non sul cartello
              </Badge>
            )}
          </div>
          {event.subtitle && <div className="truncate text-sm text-slate-500">{event.subtitle}</div>}
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-600">
            <span className="font-medium tabular-nums">
              {formatAdminTime(event.startAt)}–{formatAdminTime(event.endAt)}
            </span>
            <span className="text-slate-500 tabular-nums">{heldText(event)}</span>
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5 text-slate-400" />
              {roomNames}
            </span>
          </div>
        </div>
      </div>
      <div className="flex gap-1 self-end sm:self-auto">
        <Link to={`/admin/events/${event.id}?d=${day}`} className={buttonClass('ghost', 'sm')} title="Modifica">
          <Pencil className="size-4" />
          <span className="sm:hidden lg:inline">Modifica</span>
        </Link>
        <Link to={`/admin/events/${event.id}/clone?d=${day}`} className={buttonClass('ghost', 'sm')} title="Duplica">
          <Copy className="size-4" />
        </Link>
        <Button
          size="sm"
          variant="ghost"
          title={event.visible ? 'Nascondi dal cartello' : 'Mostra sul cartello'}
          busy={toggle.isPending}
          onClick={() => toggle.mutate()}
        >
          {event.visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
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

/** One day of the week: its timeline and the events running that day. */
function DaySection({
  day,
  rooms,
  events,
  now,
}: {
  day: number;
  rooms: Room[];
  events: ScheduledEvent[];
  now: number;
}) {
  const navigate = useNavigate();
  const value = toDateValue(day);
  const next = addDays(day, 1).getTime();
  // Events holding a room this day, also only by preparation or clean-up (the timeline shows those as
  // stripes); the list is about what runs this day.
  const touching = events.filter((e) => e.prepAt < next && e.releaseAt > day);
  const running = touching.filter((e) => e.startAt < next && e.endAt > day);
  const roomMap = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const bookable = rooms.filter((r) => r.kind === 'main');
  const today = isToday(day);
  const drafts = running.filter((e) => !e.visible).length;
  const [printing, setPrinting] = useState(false);

  return (
    <section id={`day-${value}`} className="scroll-mt-20">
      <Card className={`overflow-hidden ${today ? 'ring-2 ring-brand-600' : ''}`}>
        <div className="flex items-center gap-3 px-4 py-3">
          <h2 className="font-semibold text-slate-900 first-letter:uppercase">{formatAdminDay(day)}</h2>
          {today && <Badge tone="brand">Oggi</Badge>}
          <span className="text-sm text-slate-500">
            {running.length === 0 ? 'nessun evento' : running.length === 1 ? '1 evento' : `${running.length} eventi`}
            {drafts > 0 && <span className="text-amber-700"> · {drafts === 1 ? '1 bozza' : `${drafts} bozze`}</span>}
          </span>
          <Button size="sm" variant="ghost" className="ml-auto" title="Stampa gli eventi del giorno" onClick={() => printSheet(setPrinting)}>
            <Printer className="size-4" />
            <span className="hidden sm:inline">Stampa</span>
          </Button>
          <Link to={`/admin/events/new?d=${value}`} className={buttonClass('ghost', 'sm')} title="Nuovo evento in questo giorno">
            <Plus className="size-4" />
            <span className="hidden sm:inline">Evento</span>
          </Link>
        </div>
        <div className="border-t border-slate-100 p-4">
          {bookable.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">Nessuna sala configurata. Il superadmin può aggiungerle dalla pagina Sale.</p>
          ) : (
            <Timeline
              day={day}
              rooms={bookable}
              events={touching}
              now={now}
              onOpen={(e) => navigate(`/admin/events/${e.id}?d=${value}`)}
              onCreate={(roomId, hour) => navigate(`/admin/events/new?d=${value}&room=${roomId}&start=${String(hour).padStart(2, '0')}:00`)}
            />
          )}
        </div>
        {running.length > 0 && (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {running.map((event) => (
              <EventRow key={event.id} event={event} rooms={roomMap} day={value} />
            ))}
          </ul>
        )}
      </Card>
      {printing && <DayPrint day={day} events={running.filter((e) => e.visible)} rooms={roomMap} />}
    </section>
  );
}

/** The programme, a week at a time (Monday to Sunday), one day under the other. */
export default function WeekView() {
  const [params, setParams] = useSearchParams();
  const selectedValue = params.get('d') ?? toDateValue(Date.now());
  const selected = startOfDay(fromDateValue(selectedValue) ?? Date.now()).getTime();
  const weekStart = startOfWeek(selected, { weekStartsOn: 1 }).getTime();
  const weekEnd = addDays(weekStart, 7).getTime();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i).getTime());

  const events = useEvents(weekStart, weekEnd);
  const rooms = useRooms();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Show the selected day (today, or the day the editor came back from) once the week has loaded.
  const loaded = !events.isPending && !rooms.isPending;
  useEffect(() => {
    if (loaded) document.getElementById(`day-${toDateValue(selected)}`)?.scrollIntoView({ block: 'start' });
  }, [loaded, selected]);

  const goTo = (t: number) => setParams({ d: toDateValue(t) });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => goTo(addDays(weekStart, -7).getTime())} aria-label="Settimana precedente">
              <ChevronLeft className="size-4" />
            </Button>
            <input
              type="date"
              className={`${inputClass} w-auto!`}
              value={toDateValue(selected)}
              onChange={(e) => e.target.value && setParams({ d: e.target.value })}
              onKeyDown={(e) => {
                const value = dateShortcut(e);
                if (value) setParams({ d: value });
              }}
            />
            <Button size="sm" variant="ghost" onClick={() => goTo(weekEnd)} aria-label="Settimana successiva">
              <ChevronRight className="size-4" />
            </Button>
            {!isSameWeek(selected, Date.now(), { weekStartsOn: 1 }) && (
              <Button size="sm" variant="ghost" onClick={() => goTo(Date.now())}>
                Questa settimana
              </Button>
            )}
          </div>
          <h1 className="flex-1 text-lg font-semibold text-slate-900">{formatAdminWeek(weekStart, addDays(weekStart, 6).getTime())}</h1>
          <Link to={`/admin/events/new?d=${toDateValue(selected)}`} className={buttonClass('primary')}>
            <Plus className="size-4" />
            Nuovo evento
          </Link>
        </div>

        {events.isError && <ErrorNote>{errorMessage(events.error)}</ErrorNote>}
        {!loaded ? (
          <PageLoading />
        ) : (
          days.map((day) => <DaySection key={day} day={day} rooms={rooms.data ?? []} events={events.data ?? []} now={now} />)
        )}
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <RoomStatusPanel />
      </aside>
    </div>
  );
}
