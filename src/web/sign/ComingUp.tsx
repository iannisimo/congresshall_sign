import type { ScheduledEvent } from '../../shared/model.ts';
import { formatDay } from '../lib/format.ts';
import { useRemHeight } from './hooks.ts';
import { Marquee } from './Marquee.tsx';
import { Time } from './parts.tsx';
import type { DayGroup } from './schedule.ts';
import { strings } from './strings.ts';

// Heights in rem, used to fit as many rows as the panel can show.
const DAY_HEIGHT = 2.75;
const ROW_HEIGHT = 4.25;
const MORE_HEIGHT = 2.25;

type Line = { kind: 'day'; day: number } | { kind: 'event'; event: ScheduledEvent };

/** Fills the space top-down, keeping room for a "+N more" line when something doesn't fit. */
function fit(groups: DayGroup[], height: number): { lines: Line[]; hidden: number } {
  const total = groups.reduce((n, g) => n + g.events.length, 0);
  const lines: Line[] = [];
  let used = 0;
  let shown = 0;
  for (const group of groups) {
    for (const [i, event] of group.events.entries()) {
      const needed = (i === 0 ? DAY_HEIGHT : 0) + ROW_HEIGHT;
      const reserve = shown + 1 < total ? MORE_HEIGHT : 0;
      if (used + needed + reserve > height) return { lines, hidden: total - shown };
      if (i === 0) lines.push({ kind: 'day', day: group.day });
      lines.push({ kind: 'event', event });
      used += needed;
      shown += 1;
    }
  }
  return { lines, hidden: 0 };
}

export function ComingUp({ groups, roomNames }: { groups: DayGroup[]; roomNames: (ids: number[]) => string[] }) {
  const [ref, height] = useRemHeight<HTMLDivElement>();
  const { lines, hidden } = fit(groups, height);

  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-hidden">
      {lines.map((line) =>
        line.kind === 'day' ? (
          <div
            key={`d${line.day}`}
            className="flex items-end pb-[0.4rem] text-[1.15rem] font-bold uppercase tracking-[0.14em] text-brand-800"
            style={{ height: `${DAY_HEIGHT}rem` }}
          >
            {formatDay(line.day)}
          </div>
        ) : (
          <div key={line.event.id} className="flex items-center gap-[1rem]" style={{ height: `${ROW_HEIGHT}rem` }}>
            <Time at={line.event.startAt} className="w-[6.25rem] shrink-0 text-right text-[1.45rem] font-semibold text-brand-950" />
            <div className="min-w-0 flex-1 border-l-[0.2rem] border-brand-200 pl-[1rem]">
              <Marquee text={line.event.title} className="text-[1.4rem] leading-snug font-semibold text-slate-900" />
              <Marquee
                text={`${line.event.organizerName} · ${roomNames(line.event.roomIds).join(', ')}`}
                className="text-[1.1rem] leading-snug text-slate-500"
              />
            </div>
          </div>
        ),
      )}
      {hidden > 0 && (
        <div className="flex items-center pl-[7.25rem] text-[1.2rem] font-semibold text-slate-500" style={{ height: `${MORE_HEIGHT}rem` }}>
          {strings.more(hidden)}
        </div>
      )}
    </div>
  );
}
