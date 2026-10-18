import { addDays, addMonths, endOfMonth, endOfWeek, isSameMonth, isToday, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { errorMessage, useEvents, useRooms } from './api.ts';
import { fromDateValue, toDateValue } from './dates.ts';
import { Button, Card, ErrorNote, PageLoading } from './ui.tsx';

/** One colour per main room, in room order; repeats past the end. */
const ROOM_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#65a30d', '#475569', '#ea580c'];
const monthFormat = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

/** A month at a glance: for each day, a dot per main room booked that day. */
export default function MonthView() {
  const [params, setParams] = useSearchParams();
  const selected = startOfDay(fromDateValue(params.get('d') ?? '') ?? Date.now()).getTime();
  const monthStart = startOfMonth(selected).getTime();
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 }).getTime();
  const gridEnd = addDays(endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 }), 1).getTime();
  const days = Array.from({ length: Math.round((gridEnd - gridStart) / 86_400_000) }, (_, i) => addDays(gridStart, i).getTime());

  const events = useEvents(gridStart, gridEnd, { keepPrevious: true });
  const rooms = useRooms();

  const mainRooms = useMemo(
    () => (rooms.data ?? []).filter((r) => r.kind === 'main').sort((a, b) => a.sortOrder - b.sortOrder),
    [rooms.data],
  );
  const colors = useMemo(() => new Map(mainRooms.map((r, i) => [r.id, ROOM_COLORS[i % ROOM_COLORS.length]!])), [mainRooms]);

  /** Room ids booked on each day (keyed by date value); events spanning days count on each. */
  const booked = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const event of events.data ?? []) {
      for (let d = startOfDay(event.startAt).getTime(); d < event.endAt; d = addDays(d, 1).getTime()) {
        const key = toDateValue(d);
        const set = map.get(key) ?? new Set<number>();
        event.roomIds.forEach((id) => set.add(id));
        map.set(key, set);
      }
    }
    return map;
  }, [events.data]);

  const goTo = (t: number) => setParams({ d: toDateValue(t) });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={() => goTo(addMonths(monthStart, -1).getTime())} aria-label="Mese precedente">
          <ChevronLeft className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => goTo(addMonths(monthStart, 1).getTime())} aria-label="Mese successivo">
          <ChevronRight className="size-4" />
        </Button>
        <h1 className="ml-2 flex-1 text-lg font-semibold text-slate-900 capitalize">{monthFormat.format(monthStart)}</h1>
        {!isSameMonth(monthStart, Date.now()) && (
          <Button size="sm" variant="ghost" onClick={() => goTo(Date.now())}>
            Questo mese
          </Button>
        )}
      </div>

      {events.isError && <ErrorNote>{errorMessage(events.error)}</ErrorNote>}
      {events.isPending || rooms.isPending ? (
        <PageLoading />
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = toDateValue(day);
              const ids = booked.get(key);
              const inMonth = isSameMonth(day, monthStart);
              return (
                <Link
                  key={key}
                  to={`/admin?d=${key}`}
                  className={`flex aspect-square min-h-16 flex-col border-r border-b border-slate-100 p-1.5 hover:bg-brand-50 sm:aspect-[4/3] ${inMonth ? '' : 'bg-slate-50/60 text-slate-400'}`}
                >
                  <span
                    className={`grid size-7 place-items-center rounded-full text-sm tabular-nums ${isToday(day) ? 'bg-brand-700 font-semibold text-white' : ''}`}
                  >
                    {new Date(day).getDate()}
                  </span>
                  <span className="mt-auto flex flex-wrap gap-1">
                    {mainRooms
                      .filter((r) => ids?.has(r.id))
                      .map((r) => (
                        <span key={r.id} title={r.name} className={`size-2.5 rounded-full ${inMonth ? '' : 'opacity-40'}`} style={{ background: colors.get(r.id) }} />
                      ))}
                  </span>
                </Link>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 px-4 py-3 text-sm text-slate-600">
            {mainRooms.map((r) => (
              <span key={r.id} className="flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ background: colors.get(r.id) }} />
                {r.name}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
