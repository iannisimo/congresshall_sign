import { useMutation } from '@tanstack/react-query';
import { addDays, isToday, startOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Copy, Eye, EyeOff, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { Room, ScheduledEvent } from '../../shared/model.ts';
import { formatAdminDay, formatAdminTime } from '../lib/format.ts';
import { Logo } from '../sign/parts.tsx';
import { api, errorMessage, refreshSchedule, useEvents, useRooms } from './api.ts';
import { dateShortcut, fromDateValue, toDateValue } from './dates.ts';
import { RoomStatusPanel } from './RoomStatusPanel.tsx';
import { Timeline } from './Timeline.tsx';
import { Badge, Button, buttonClass, Card, ErrorNote, inputClass, PageLoading, useFeedback } from './ui.tsx';

/** The event as API input, e.g. to flip its visibility. */
export function toInput(event: ScheduledEvent) {
  const { id: _id, organizerName: _name, ...input } = event;
  return input;
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
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <Logo logoId={event.logoId} name={event.organizerName} className="size-14 ring-1 ring-slate-200" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold tracking-wide text-brand-800 uppercase">{event.organizerName}</div>
          <div className="flex items-center gap-2">
            <Link to={`/admin/events/${event.id}?d=${day}`} className="truncate font-semibold text-slate-900 hover:underline">
              {event.title}
            </Link>
            {!event.visible && <Badge tone="amber">Nascosto</Badge>}
          </div>
          {event.subtitle && <div className="truncate text-sm text-slate-500">{event.subtitle}</div>}
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-600">
            <span className="font-medium tabular-nums">
              {formatAdminTime(event.startAt)}–{formatAdminTime(event.endAt)}
            </span>
            <span className="text-slate-500 tabular-nums">
              sala riservata {formatAdminTime(event.prepAt)}–{formatAdminTime(event.releaseAt)}
            </span>
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

export default function DayView() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const dayValue = params.get('d') ?? toDateValue(Date.now());
  const day = startOfDay(fromDateValue(dayValue) ?? Date.now()).getTime();
  const next = addDays(day, 1).getTime();

  const events = useEvents(day, next);
  const rooms = useRooms();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const roomMap = useMemo(() => new Map((rooms.data ?? []).map((r) => [r.id, r])), [rooms.data]);
  const bookable = (rooms.data ?? []).filter((r) => r.kind === 'main');
  const goTo = (t: number) => setParams({ d: toDateValue(t) });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => goTo(addDays(day, -1).getTime())} aria-label="Giorno precedente">
              <ChevronLeft className="size-4" />
            </Button>
            <input
              type="date"
              className={`${inputClass} w-auto!`}
              value={dayValue}
              onChange={(e) => e.target.value && setParams({ d: e.target.value })}
              onKeyDown={(e) => {
                const value = dateShortcut(e);
                if (value) setParams({ d: value });
              }}
            />
            <Button size="sm" variant="ghost" onClick={() => goTo(next)} aria-label="Giorno successivo">
              <ChevronRight className="size-4" />
            </Button>
            {!isToday(day) && (
              <Button size="sm" variant="ghost" onClick={() => goTo(Date.now())}>
                Oggi
              </Button>
            )}
          </div>
          <h1 className="flex-1 text-lg font-semibold text-slate-900 first-letter:uppercase">{formatAdminDay(day)}</h1>
          <Link to={`/admin/events/new?d=${dayValue}`} className={buttonClass('primary')}>
            <Plus className="size-4" />
            Nuovo evento
          </Link>
        </div>

        {events.isError && <ErrorNote>{errorMessage(events.error)}</ErrorNote>}
        {events.isPending || rooms.isPending ? (
          <PageLoading />
        ) : (
          <>
            <Card className="p-4">
              {bookable.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">Nessuna sala configurata. Il superadmin può aggiungerle dalla pagina Sale.</p>
              ) : (
                <Timeline
                  day={day}
                  rooms={bookable}
                  events={events.data ?? []}
                  now={now}
                  onOpen={(e) => navigate(`/admin/events/${e.id}?d=${dayValue}`)}
                  onCreate={(roomId, hour) => navigate(`/admin/events/new?d=${dayValue}&room=${roomId}&start=${String(hour).padStart(2, '0')}:00`)}
                />
              )}
            </Card>

            <Card>
              {(events.data ?? []).length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-500">Nessun evento in questo giorno.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {(events.data ?? []).map((event) => (
                    <EventRow key={event.id} event={event} rooms={roomMap} day={dayValue} />
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <RoomStatusPanel />
      </aside>
    </div>
  );
}
