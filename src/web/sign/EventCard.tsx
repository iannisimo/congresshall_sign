import { Coffee, MapPin, Pause, UtensilsCrossed } from 'lucide-react';
import type { EventBreak, SignEvent } from '../../shared/model.ts';
import { eventPhase } from '../../shared/status.ts';
import { formatDay } from '../lib/format.ts';
import { FitText, Marquee } from './Marquee.tsx';
import { Logo, Time } from './parts.tsx';
import { strings } from './strings.ts';

/** Height of a card, in rem; the sign uses it to work out how many fit. */
export const CARD_HEIGHT = 8.75;
/** Width of a card on a 16:9 sign, in rem; the admin preview uses it to scale. */
export const CARD_WIDTH = 54;

function BreakIcon({ label }: { label: string }) {
  const className = 'size-[1.25rem] shrink-0';
  if (/lunch|pranzo/i.test(label)) return <UtensilsCrossed className={className} strokeWidth={2.25} />;
  if (/coffee|caff/i.test(label)) return <Coffee className={className} strokeWidth={2.25} />;
  return <Pause className={className} strokeWidth={2.25} />;
}

/** The break under way ("Coffee break → 11:00 AM") or the next one ("Coffee break 10:30 AM"). */
function BreakLine({ pause, now }: { pause: EventBreak; now: number }) {
  const current = now >= pause.startAt;
  return (
    <span
      className={`mt-[0.5rem] flex max-w-[18rem] items-center gap-[0.4rem] rounded-full px-[0.7rem] py-[0.15rem] text-[1.15rem] font-semibold ${current ? 'bg-reserved/20 text-reserved-deep' : 'bg-slate-100 text-slate-600'}`}
    >
      <BreakIcon label={pause.label} />
      <span className="truncate">{pause.label}</span>
      <span className="shrink-0">
        {current ? '→ ' : ''}
        <Time at={current ? pause.endAt : pause.startAt} />
      </span>
    </span>
  );
}

/** Big card for an event that is running or coming up soon. Also used as the admin preview. */
export function EventCard({
  event,
  roomNames,
  now,
  showDay = false,
}: {
  event: SignEvent;
  roomNames: string[];
  now: number;
  showDay?: boolean;
}) {
  const live = eventPhase(event, now) === 'live';
  const progress = live ? (now - event.startAt) / (event.endAt - event.startAt) : 0;
  // The break under way, or else the next one.
  const pause = live ? (event.breaks.find((b) => now < b.endAt) ?? null) : null;

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
          <Marquee text={roomNames.join(' · ')} className="min-w-0 flex-1" />
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
            {pause && <BreakLine pause={pause} now={now} />}
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

/**
 * Card that fills the space when the featured day has only one or two events: big logo, and a title
 * that wraps, shrinks and, as a last resort, scrolls up (`FitText`). Alone (`pair` false), the times go
 * under the title; as one of two, they stay on the right like on the smaller card.
 */
export function HeroCard({
  event,
  roomNames,
  now,
  showDay = false,
  pair = false,
}: {
  event: SignEvent;
  roomNames: string[];
  now: number;
  showDay?: boolean;
  pair?: boolean;
}) {
  const live = eventPhase(event, now) === 'live';
  const progress = live ? (now - event.startAt) / (event.endAt - event.startAt) : 0;
  const pause = live ? (event.breaks.find((b) => now < b.endAt) ?? null) : null;

  const times = live ? (
    <>
      {!pair && pause && <BreakLine pause={pause} now={now} />}
      <span className={`font-semibold text-slate-600 ${pair ? 'text-[2.2rem]' : 'ml-auto text-[3rem] leading-none'}`}>
        → <Time at={event.endAt} />
      </span>
      {pair && pause && <BreakLine pause={pause} now={now} />}
    </>
  ) : (
    <>
      {showDay && (
        <span className={`font-bold uppercase tracking-[0.12em] text-slate-500 ${pair ? 'text-[1.25rem]' : 'text-[1.4rem]'}`}>
          {formatDay(event.startAt)}
        </span>
      )}
      <Time at={event.startAt} className={`leading-none font-semibold text-brand-950 ${pair ? 'text-[3.2rem]' : 'text-[3.6rem]'}`} />
      <span className={`font-medium text-slate-500 ${pair ? 'mt-[0.4rem] text-[1.6rem]' : 'ml-auto text-[1.9rem]'}`}>
        – <Time at={event.endAt} />
      </span>
    </>
  );

  return (
    <article
      className={`relative flex min-h-0 flex-1 items-center overflow-hidden rounded-[1.25rem] bg-white shadow-[0_0.15rem_0.6rem_rgb(16_80_140/0.08)] ring-1 ring-slate-900/5 ${pair ? 'gap-[2rem] py-[1.25rem] pr-[2.25rem] pl-[1.5rem]' : 'gap-[2.5rem] py-[2rem] pr-[2.75rem] pl-[2.25rem]'}`}
    >
      <Logo logoId={event.logoId} name={event.organizerName} className={pair ? 'size-[10rem]' : 'size-[15rem]'} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className={`font-bold uppercase tracking-[0.12em] text-brand-800 ${pair ? 'text-[1.2rem]' : 'text-[1.3rem]'}`}>
          <Marquee text={event.organizerName} />
        </div>
        <h3 className="mt-[0.4rem] font-semibold tracking-tight text-slate-900">
          <FitText text={event.title} lines={pair ? 2 : 3} size={pair ? 2.4 : 3.2} minSize={pair ? 1.9 : 2.4} leading={1.12} />
        </h3>
        {event.subtitle && (
          <p className="mt-[0.5rem] text-slate-500">
            <FitText text={event.subtitle} lines={pair ? 1 : 2} size={pair ? 1.45 : 1.7} minSize={pair ? 1.2 : 1.35} leading={1.3} />
          </p>
        )}
        <div className={`flex min-w-0 items-center gap-[0.5rem] font-medium text-slate-600 ${pair ? 'mt-[0.5rem] text-[1.4rem]' : 'mt-[0.9rem] text-[1.6rem]'}`}>
          <MapPin className="size-[1.1em] shrink-0 text-brand-700" strokeWidth={2.25} />
          <Marquee text={roomNames.join(' · ')} className="min-w-0 flex-1" />
        </div>
        {!pair && <div className="mt-[1.25rem] flex flex-wrap items-baseline gap-x-[1rem] gap-y-[0.4rem]">{times}</div>}
      </div>

      {pair && <div className="flex shrink-0 flex-col items-end">{times}</div>}

      {live && (
        <span
          className={`absolute flex items-center gap-[0.5rem] rounded-full bg-brand-900 px-[0.9rem] py-[0.3rem] text-[1.1rem] font-bold uppercase tracking-[0.14em] text-white ${pair ? 'top-[1rem] right-[1.25rem]' : 'top-[1.5rem] right-[1.75rem]'}`}
        >
          <span className="size-[0.55rem] animate-pulse rounded-full bg-white" />
          {strings.now}
        </span>
      )}

      {live && (
        <div className="absolute inset-x-0 bottom-0 h-[0.35rem] bg-brand-100">
          <div className="h-full bg-brand-700 transition-[width] duration-1000" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </article>
  );
}
