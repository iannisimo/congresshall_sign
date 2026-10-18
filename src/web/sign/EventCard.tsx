import { MapPin } from 'lucide-react';
import type { ScheduledEvent } from '../../shared/model.ts';
import { eventPhase } from '../../shared/status.ts';
import { formatDay } from '../lib/format.ts';
import { Marquee } from './Marquee.tsx';
import { Logo, Time } from './parts.tsx';
import { strings } from './strings.ts';

/** Height of a card, in rem; the sign uses it to work out how many fit. */
export const CARD_HEIGHT = 8.75;
/** Width of a card on a 16:9 sign, in rem; the admin preview uses it to scale. */
export const CARD_WIDTH = 54;

/** Big card for an event that is running or coming up soon. Also used as the admin preview. */
export function EventCard({
  event,
  roomNames,
  now,
  showDay = false,
}: {
  event: ScheduledEvent;
  roomNames: string[];
  now: number;
  showDay?: boolean;
}) {
  const live = eventPhase(event, now) === 'live';
  const progress = live ? (now - event.startAt) / (event.endAt - event.startAt) : 0;

  return (
    <article
      className="relative flex shrink-0 items-center gap-[1.5rem] overflow-hidden rounded-[1.25rem] bg-white pr-[1.75rem] pl-[1.25rem] shadow-[0_0.15rem_0.6rem_rgb(16_80_140/0.08)] ring-1 ring-slate-900/5"
      style={{ height: `${CARD_HEIGHT}rem` }}
    >
      <Logo logoId={event.logoId} name={event.organizerName} className="size-[6.75rem]" />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[1.1rem] font-bold uppercase tracking-[0.12em] text-brand-800">{event.organizerName}</div>
        <h3 className="text-[2.1rem] leading-tight font-semibold tracking-tight text-slate-900">
          <Marquee text={event.title} />
        </h3>
        {event.subtitle && (
          <p className="text-[1.35rem] leading-snug text-slate-500">
            <Marquee text={event.subtitle} />
          </p>
        )}
        <div className="mt-[0.35rem] flex min-w-0 items-center gap-[0.4rem] text-[1.25rem] font-medium text-slate-600">
          <MapPin className="size-[1.25rem] shrink-0 text-brand-700" strokeWidth={2.25} />
          <span className="truncate">{roomNames.join(' · ')}</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end">
        {live ? (
          <>
            <span className="flex items-center gap-[0.5rem] rounded-full bg-brand-900 px-[0.9rem] py-[0.3rem] text-[1.1rem] font-bold uppercase tracking-[0.14em] text-white">
              <span className="size-[0.55rem] animate-pulse rounded-full bg-white" />
              {strings.now}
            </span>
            <span className="mt-[0.6rem] text-[1.6rem] font-semibold text-slate-600">
              → <Time at={event.endAt} />
            </span>
          </>
        ) : (
          <>
            {showDay && (
              <span className="text-[1.15rem] font-bold uppercase tracking-[0.12em] text-slate-500">{formatDay(event.startAt)}</span>
            )}
            <Time at={event.startAt} className="text-[2.6rem] leading-none font-semibold text-brand-950" />
            <span className="mt-[0.4rem] text-[1.35rem] font-medium text-slate-500">
              – <Time at={event.endAt} />
            </span>
          </>
        )}
      </div>

      {live && (
        <div className="absolute inset-x-0 bottom-0 h-[0.3rem] bg-brand-100">
          <div className="h-full bg-brand-700 transition-[width] duration-1000" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </article>
  );
}
