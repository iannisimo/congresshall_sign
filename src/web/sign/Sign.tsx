import { CalendarDays, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ScheduledEvent } from '../../shared/model.ts';
import { computeRoomStatuses } from '../../shared/status.ts';
import { DEFAULT_SETTINGS } from '../../shared/settings.ts';
import { HOUR, MINUTE } from '../../shared/time.ts';
import { formatDay } from '../lib/format.ts';
import { ComingUp } from './ComingUp.tsx';
import { CARD_HEIGHT, EventCard, HeroCard } from './EventCard.tsx';
import { Header, StalePill } from './Header.tsx';
import { useKiosk, useNow, useRemHeight, useSelfUpdate, useSignTheme, useThemeColors } from './hooks.ts';
import { Carousel, NightClock, usePrefetchMedia } from './Carousel.tsx';
import { MarqueeCycle, MarqueeSettings } from './Marquee.tsx';
import { SectionTitle, Time } from './parts.tsx';
import { RecoveringBoundary } from './RecoveringBoundary.tsx';
import { RoomStrip } from './RoomStrip.tsx';
import { buildSignView } from './schedule.ts';
import { strings } from './strings.ts';
import { useSnapshot } from './useSnapshot.ts';

const CARD_GAP = 1;
/** Shortest time a page of cards stays up; longer while a text on it is still scrolling. */
const PAGE_INTERVAL = 12_000;
/** Up to this many events on the featured day, their cards grow to fill the column. */
const HERO_MAX = 2;

type FeaturedProps = {
  events: ScheduledEvent[];
  now: number;
  showDay: boolean;
  roomNames: (ids: number[]) => string[];
};

/** The featured day's events: big cards filling the column when there are few, pages of cards otherwise. */
function Featured({ events, now, showDay, roomNames }: FeaturedProps) {
  if (events.length > HERO_MAX) return <CardPages events={events} now={now} showDay={showDay} roomNames={roomNames} />;
  return (
    <div className="mt-[1rem] flex min-h-0 flex-1 flex-col" style={{ gap: `${CARD_GAP}rem` }}>
      {events.map((event) => (
        <HeroCard
          key={event.id}
          event={event}
          now={now}
          showDay={showDay}
          pair={events.length > 1}
          roomNames={roomNames(event.roomIds)}
        />
      ))}
    </div>
  );
}

function CardPages({ events, now, showDay, roomNames }: FeaturedProps) {
  const [ref, height] = useRemHeight<HTMLDivElement>();
  const perPage = Math.max(1, Math.floor((height + CARD_GAP) / (CARD_HEIGHT + CARD_GAP)));
  const pages = Math.ceil(events.length / perPage);
  const [counter, setCounter] = useState(0);
  const page = pages > 1 ? counter % pages : 0;

  // Longest scroll cycle among the texts on the current page, so the page waits for it to finish.
  const [longest, setLongest] = useState({ page: -1, ms: 0 });
  const reportCycle = useCallback(
    (ms: number) => setLongest((prev) => (prev.page === page && prev.ms >= ms ? prev : { page, ms: prev.page === page ? Math.max(prev.ms, ms) : ms })),
    [page],
  );
  const stay = Math.max(PAGE_INTERVAL, longest.page === page ? longest.ms + 1000 : 0);
  useEffect(() => {
    if (pages <= 1) return;
    const timer = setTimeout(() => setCounter((c) => c + 1), stay);
    return () => clearTimeout(timer);
  }, [page, pages, stay]);

  const visible = events.slice(page * perPage, (page + 1) * perPage);

  return (
    <>
      <div ref={ref} className="mt-[1rem] flex min-h-0 flex-1 flex-col overflow-hidden" style={{ gap: `${CARD_GAP}rem` }}>
        <MarqueeCycle.Provider value={pages > 1 ? reportCycle : null}>
          {height > 0 &&
            visible.map((event) => (
              <EventCard key={event.id} event={event} now={now} showDay={showDay} roomNames={roomNames(event.roomIds)} />
            ))}
        </MarqueeCycle.Provider>
      </div>
      {pages > 1 && (
        <div className="mt-[0.75rem] flex justify-center gap-[0.5rem]">
          {Array.from({ length: pages }, (_, i) => (
            <span key={i} className={`h-[0.5rem] rounded-full transition-all ${i === page ? 'w-[2rem] bg-brand-800' : 'w-[0.5rem] bg-slate-300'}`} />
          ))}
        </div>
      )}
    </>
  );
}

function OutdatedWarning({ since }: { since: number }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-canvas/80 backdrop-blur-sm">
      <div className="flex max-w-[60rem] flex-col items-center gap-[1rem] rounded-[2rem] bg-white px-[4rem] py-[3rem] text-center shadow-xl ring-[0.3rem] ring-reserved">
        <WifiOff className="size-[5rem] text-reserved-deep" strokeWidth={2} />
        <div className="text-[3rem] font-bold text-slate-900">{strings.offline}</div>
        <div className="text-[1.6rem] font-medium text-slate-500">
          {strings.lastUpdate}: {formatDay(since)}, <Time at={since} />
        </div>
      </div>
    </div>
  );
}

function SignScreen() {
  useKiosk();
  const { snapshot, lastContactAt, clockOffset } = useSnapshot();
  useSelfUpdate(snapshot?.version, lastContactAt);
  const now = useNow(clockOffset);
  // Snapshots saved by older versions may lack some settings.
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...snapshot?.settings }), [snapshot]);
  const theme = useSignTheme(settings, now);
  useThemeColors(settings);
  const media = useMemo(() => snapshot?.media ?? [], [snapshot]);
  usePrefetchMedia(media);

  const rooms = useMemo(() => snapshot?.rooms ?? [], [snapshot]);
  const roomNames = useMemo(() => {
    const names = new Map(rooms.map((r) => [r.id, r.name]));
    return (ids: number[]) => ids.flatMap((id) => names.get(id) ?? []);
  }, [rooms]);
  // Statuses change at most once a minute in practice, but are cheap enough to compute every second.
  const statuses = useMemo(
    () => computeRoomStatuses({ rooms, events: snapshot?.events ?? [], overrides: snapshot?.overrides ?? [], now }),
    [rooms, snapshot, now],
  );
  const view = useMemo(() => buildSignView(snapshot?.events ?? [], now), [snapshot, Math.floor(now / MINUTE)]);

  const offlineFor = lastContactAt === null ? 0 : now - lastContactAt;

  if (!snapshot) {
    return (
      <div className="flex h-screen flex-col bg-canvas">
        <Header now={now} staleSince={null} logo={null} />
        <div className="grid flex-1 place-items-center text-[2rem] font-semibold text-slate-400">{strings.connecting}</div>
      </div>
    );
  }

  const featuredIsToday = view.featuredDay === null || view.featuredDay <= now;
  const nothingPlanned = view.featured.length === 0;
  const outdated = offlineFor > settings.offlineAfterHours * HOUR && lastContactAt !== null;

  const staleSince = offlineFor > settings.staleAfterMinutes * MINUTE ? lastContactAt : null;

  // Nothing planned and media to show: the carousel takes the whole screen above the rooms.
  if (nothingPlanned && media.length > 0 && !(theme === 'dark' && settings.nightClock)) {
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-canvas">
        <main className="relative flex min-h-0 flex-1">
          <Carousel items={media} imageSeconds={settings.carouselImageSeconds} defaultFit={settings.carouselFit} />
          {staleSince !== null && <StalePill since={staleSince} now={now} className="absolute top-[1rem] right-[1.5rem] bg-white/90" />}
          {outdated && <OutdatedWarning since={lastContactAt!} />}
        </main>
        <RoomStrip rooms={rooms} statuses={statuses} now={now} />
      </div>
    );
  }

  // Night with nothing planned: only a dim clock and the rooms.
  if (nothingPlanned && theme === 'dark' && settings.nightClock) {
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-canvas">
        <main className="relative flex min-h-0 flex-1">
          <NightClock now={now} />
          {outdated && <OutdatedWarning since={lastContactAt!} />}
        </main>
        <RoomStrip rooms={rooms} statuses={statuses} now={now} />
      </div>
    );
  }

  return (
    <MarqueeSettings.Provider value={settings}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-canvas">
        <Header now={now} staleSince={staleSince} logo={snapshot.venueLogo ?? null} />

        <main className="relative flex min-h-0 flex-1 gap-[2.5rem] px-[2.5rem] pt-[1.75rem] pb-[1.5rem]">
          {nothingPlanned ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-[1rem] text-slate-400">
              <CalendarDays className="size-[5rem]" strokeWidth={1.5} />
              <span className="text-[2rem] font-semibold">{strings.noEvents}</span>
            </div>
          ) : (
            <section className="flex min-w-0 flex-[1.6] flex-col">
              <SectionTitle>{featuredIsToday ? strings.today : formatDay(view.featuredDay!)}</SectionTitle>
              <Featured events={view.featured} now={now} showDay={!featuredIsToday} roomNames={roomNames} />
            </section>
          )}

          {view.comingUp.length > 0 && (
            <section className="flex min-w-0 flex-1 flex-col">
              <SectionTitle>{strings.comingUp}</SectionTitle>
              <div className="mt-[1rem] flex min-h-0 flex-1 flex-col rounded-[1.25rem] bg-white px-[1.5rem] pb-[0.75rem] shadow-[0_0.15rem_0.6rem_rgb(16_80_140/0.08)] ring-1 ring-slate-900/5">
                <ComingUp groups={view.comingUp} roomNames={roomNames} />
              </div>
            </section>
          )}

          {outdated && <OutdatedWarning since={lastContactAt!} />}
        </main>

        <RoomStrip rooms={rooms} statuses={statuses} now={now} />
      </div>
    </MarqueeSettings.Provider>
  );
}

export default function Sign() {
  return (
    <RecoveringBoundary>
      <SignScreen />
    </RecoveringBoundary>
  );
}
