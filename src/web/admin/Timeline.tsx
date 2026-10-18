import { useLayoutEffect, useRef } from 'react';
import type { Room, ScheduledEvent } from '../../shared/model.ts';
import { DAY, HOUR } from '../../shared/time.ts';
import { formatAdminShortDay, formatAdminTime } from '../lib/format.ts';

const DEFAULT_FIRST_HOUR = 7;
const DEFAULT_LAST_HOUR = 24;
const NAMES_WIDTH = 128; // px, the room names column

/** Splits a room's events into lanes so events running at the same time (conflicts) sit on separate lines. */
function lanes(events: ScheduledEvent[]): ScheduledEvent[][] {
  const result: ScheduledEvent[][] = [];
  for (const event of [...events].sort((a, b) => a.startAt - b.startAt)) {
    const lane = result.find((l) => l[l.length - 1]!.endAt <= event.startAt);
    if (lane) lane.push(event);
    else result.push([event]);
  }
  return result.length > 0 ? result : [[]];
}

const stripes = 'bg-[repeating-linear-gradient(135deg,var(--color-slate-100)_0_6px,var(--color-slate-200)_6px_12px)]';

function heldText(event: ScheduledEvent): string {
  const at = (t: number) => `${formatAdminTime(t)} di ${formatAdminShortDay(t)}`;
  return `${event.title} · sala riservata dalle ${at(event.prepAt)} alle ${at(event.releaseAt)}`;
}

/**
 * One row per bookable room over the day (ADMIN-2). Events are blocks; preparation and clean-up are
 * stripes behind them, also for events of the previous or next day whose margins reach into this one.
 * Clicking an empty spot starts a new event in that room at that hour.
 */
export function Timeline({
  day,
  rooms,
  events,
  now,
  onOpen,
  onCreate,
}: {
  day: number;
  rooms: Room[];
  /** Events holding a room at some point of the day, including only by preparation or clean-up. */
  events: ScheduledEvent[];
  now: number;
  onOpen: (event: ScheduledEvent) => void;
  onCreate: (roomId: number, hour: number) => void;
}) {
  const running = events.filter((e) => e.startAt < day + DAY && e.endAt > day);

  // Widen the default hours to show events running outside them (margins alone don't widen it).
  let first = DEFAULT_FIRST_HOUR;
  let last = DEFAULT_LAST_HOUR;
  for (const e of running) {
    first = Math.min(first, Math.floor((Math.max(e.startAt, day) - day) / HOUR));
    last = Math.max(last, Math.ceil((Math.min(e.endAt, day + DAY) - day) / HOUR));
  }
  const start = day + first * HOUR;
  const span = (last - first) * HOUR;
  const clip = (t: number) => Math.min(Math.max(t, start), start + span);
  const x = (t: number) => `${((clip(t) - start) / span) * 100}%`;
  const width = (from: number, to: number) => `${((clip(to) - clip(from)) / span) * 100}%`;
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const showNow = now >= start && now <= start + span;

  // On narrow screens the timeline scrolls: start where things happen (now, or the first event).
  // Only when the day or its first event changes, not as the clock ticks.
  const scroller = useRef<HTMLDivElement>(null);
  const firstEvent = running.length > 0 ? Math.min(...running.map((e) => e.startAt)) : null;
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || element.scrollWidth <= element.clientWidth) return;
    const focus = showNow ? now : (firstEvent ?? start);
    const track = element.scrollWidth - NAMES_WIDTH;
    element.scrollLeft = NAMES_WIDTH + ((Math.max(focus, start) - start) / span) * track - element.clientWidth / 3;
  }, [day, firstEvent]);

  return (
    <div ref={scroller} className="overflow-x-auto">
      <div className="min-w-[44rem]">
        <div className="flex">
          <div className="shrink-0" style={{ width: NAMES_WIDTH }} />
          <div className="relative h-6 flex-1">
            {hours.slice(0, -1).map((h, i) => (
              <span
                key={h}
                className={`absolute -translate-x-1/2 text-xs text-slate-400 tabular-nums ${i % 2 === 1 ? 'hidden sm:block' : ''}`}
                style={{ left: x(day + h * HOUR) }}
              >
                {String(h % 24).padStart(2, '0')}
              </span>
            ))}
          </div>
        </div>

        {rooms.map((room) => {
          const roomEvents = events.filter((e) => e.roomIds.includes(room.id));
          const roomLanes = lanes(running.filter((e) => e.roomIds.includes(room.id)));
          const conflict = roomLanes.length > 1;
          return (
            <div key={room.id} className="flex border-t border-slate-100">
              <div className="flex shrink-0 items-center pr-3 text-sm font-medium text-slate-700" style={{ width: NAMES_WIDTH }}>
                <span className="truncate">{room.name}</span>
              </div>
              <div
                className="relative flex-1 cursor-copy py-1.5"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const hour = Math.floor(first + ((e.clientX - rect.left) / rect.width) * (last - first));
                  onCreate(room.id, Math.min(hour, 23));
                }}
              >
                {hours.map((h) => (
                  <span key={h} className="absolute inset-y-0 w-px bg-slate-100" style={{ left: x(day + h * HOUR) }} />
                ))}
                {/* Drafts don't hold the room, so they have no preparation or clean-up to show. */}
                {roomEvents.flatMap((event) =>
                  (event.visible
                    ? [
                        [event.prepAt, event.startAt],
                        [event.endAt, event.releaseAt],
                      ]
                    : []
                  )
                    .filter(([from, to]) => clip(to!) > clip(from!))
                    .map(([from, to]) => (
                      <span
                        key={`${event.id}-${from}`}
                        title={heldText(event)}
                        className={`absolute inset-y-1.5 ${stripes}`}
                        style={{ left: x(from!), width: width(from!, to!) }}
                      />
                    )),
                )}
                {roomLanes.map((lane, i) => (
                  <div key={i} className="relative h-10">
                    {lane.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(event);
                        }}
                        title={`${event.visible ? '' : 'Bozza: '}${event.title} · ${formatAdminTime(event.startAt)}–${formatAdminTime(event.endAt)}`}
                        className={`absolute inset-y-0.5 flex cursor-pointer items-center overflow-hidden rounded-md px-2 text-left ring-1 transition-shadow hover:shadow-md ${event.visible ? 'bg-brand-100' : 'border border-dashed border-amber-500 bg-amber-50'} ${conflict ? 'ring-2 ring-red-400' : event.visible ? 'ring-brand-300' : 'ring-transparent'}`}
                        style={{ left: x(event.startAt), width: width(event.startAt, event.endAt) }}
                      >
                        <span className={`truncate text-xs font-medium ${event.visible ? 'text-slate-900' : 'text-amber-900 italic'}`}>{event.title}</span>
                      </button>
                    ))}
                  </div>
                ))}
                {showNow && <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-red-500" style={{ left: x(now) }} />}
              </div>
            </div>
          );
        })}
        <div className="mt-3 flex items-center gap-4 pl-32 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded-sm bg-brand-100 ring-1 ring-brand-300" /> Evento
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded-sm border border-dashed border-amber-500 bg-amber-50" /> Bozza
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-5 rounded-sm ${stripes}`} /> Preparazione e riordino
          </span>
        </div>
      </div>
    </div>
  );
}
