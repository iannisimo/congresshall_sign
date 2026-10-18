import { useLayoutEffect, useRef } from 'react';
import type { Room, ScheduledEvent } from '../../shared/model.ts';
import { DAY, HOUR } from '../../shared/time.ts';
import { formatAdminTime } from '../lib/format.ts';

const DEFAULT_FIRST_HOUR = 7;
const DEFAULT_LAST_HOUR = 24;

/** Splits a room's events into lanes so overlapping ones (conflicts) sit on separate lines. */
function lanes(events: ScheduledEvent[]): ScheduledEvent[][] {
  const result: ScheduledEvent[][] = [];
  for (const event of [...events].sort((a, b) => a.prepAt - b.prepAt)) {
    const lane = result.find((l) => l[l.length - 1]!.releaseAt <= event.prepAt);
    if (lane) lane.push(event);
    else result.push([event]);
  }
  return result.length > 0 ? result : [[]];
}

const stripes = 'bg-[repeating-linear-gradient(135deg,var(--color-slate-100)_0_6px,var(--color-slate-200)_6px_12px)]';

/**
 * One row per bookable room over the day (ADMIN-2): striped preparation and clean-up around the event.
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
  events: ScheduledEvent[];
  now: number;
  onOpen: (event: ScheduledEvent) => void;
  onCreate: (roomId: number, hour: number) => void;
}) {
  // Widen the default hours to show whatever is scheduled outside them.
  let first = DEFAULT_FIRST_HOUR;
  let last = DEFAULT_LAST_HOUR;
  for (const e of events) {
    first = Math.min(first, Math.floor((Math.max(e.prepAt, day) - day) / HOUR));
    last = Math.max(last, Math.ceil((Math.min(e.releaseAt, day + DAY) - day) / HOUR));
  }
  const start = day + first * HOUR;
  const span = (last - first) * HOUR;
  const x = (t: number) => `${((Math.min(Math.max(t, start), start + span) - start) / span) * 100}%`;
  const width = (from: number, to: number) => `${((Math.min(to, start + span) - Math.max(from, start)) / span) * 100}%`;
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const showNow = now >= start && now <= start + span;

  // On narrow screens the timeline scrolls: start where things happen (now, or the first event).
  // Only when the day or its first event changes, not as the clock ticks.
  const scroller = useRef<HTMLDivElement>(null);
  const firstEvent = events.length > 0 ? Math.min(...events.map((e) => e.prepAt)) : null;
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || element.scrollWidth <= element.clientWidth) return;
    const focus = showNow ? now : (firstEvent ?? start);
    const track = element.scrollWidth - 128; // minus the room names column
    element.scrollLeft = 128 + ((Math.max(focus, start) - start) / span) * track - element.clientWidth / 3;
  }, [day, firstEvent]);

  return (
    <div ref={scroller} className="overflow-x-auto">
      <div className="min-w-[44rem]">
        <div className="flex">
          <div className="w-32 shrink-0" />
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
          const roomLanes = lanes(events.filter((e) => e.roomIds.includes(room.id)));
          return (
            <div key={room.id} className="flex border-t border-slate-100">
              <div className="flex w-32 shrink-0 items-center pr-3 text-sm font-medium text-slate-700">
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
                {roomLanes.map((lane, i) => (
                  <div key={i} className="relative h-10">
                    {lane.map((event) => {
                      // Segment sizes relative to the part of the event that is on screen.
                      const from = Math.max(event.prepAt, start);
                      const to = Math.min(event.releaseAt, start + span);
                      const part = (a: number, b: number) =>
                        `${(Math.max(0, Math.min(b, to) - Math.max(a, from)) / Math.max(1, to - from)) * 100}%`;
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(event);
                          }}
                          title={`${event.title} · ${formatAdminTime(event.startAt)}–${formatAdminTime(event.endAt)}`}
                          className={`absolute inset-y-0.5 flex cursor-pointer overflow-hidden rounded-md text-left ring-1 transition-shadow hover:shadow-md ${roomLanes.length > 1 ? 'ring-2 ring-red-400' : 'ring-brand-300'} ${event.visible ? '' : 'opacity-50'}`}
                          style={{ left: x(event.prepAt), width: width(event.prepAt, event.releaseAt) }}
                        >
                          <span className={`h-full ${stripes}`} style={{ width: part(event.prepAt, event.startAt) }} />
                          <span className="h-full bg-brand-100" style={{ width: part(event.startAt, event.endAt) }} />
                          <span className={`h-full flex-1 ${stripes}`} />
                          <span className="absolute inset-0 flex items-center truncate px-2 text-xs font-medium text-slate-900">
                            {event.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
                {showNow && <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-red-500" style={{ left: x(now) }} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
