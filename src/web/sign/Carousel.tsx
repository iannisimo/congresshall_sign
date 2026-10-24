import { useEffect, useState } from 'react';
import type { MediaFit, MediaKind } from '../../shared/model.ts';
import { MINUTE } from '../../shared/time.ts';
import { clockParts, formatDay } from '../lib/format.ts';

/** Moves on from a video that never ends (stalled, or a codec the screen can't play). */
const MAX_VIDEO = 15 * MINUTE;
/** Length of the crossfade, in ms (matches the sign-fade-in animation). */
const FADE = 800;

const OBJECT_FIT: Record<MediaFit, string> = { contain: 'object-contain', fill: 'object-fill', cover: 'object-cover' };

/**
 * Images and videos in a loop, for when no event is planned: images stay up `imageSeconds`, videos
 * play once, muted, to the end. Anything that fails to load is skipped.
 */

export function Carousel({
  items,
  imageSeconds,
  defaultFit,
}: {
  items: { id: number; kind: MediaKind; fit: MediaFit | null }[];
  imageSeconds: number;
  defaultFit: MediaFit;
}) {
  const [step, setStep] = useState(0);
  const current = items[step % items.length];
  const next = () => setStep((s) => s + 1);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(next, current.kind === 'image' ? imageSeconds * 1000 : MAX_VIDEO);
    return () => clearTimeout(timer);
  }, [step, current?.id, current?.kind, imageSeconds]);

  // Load the next image ahead, so it appears without a blank moment.
  const upcoming = items[(step + 1) % items.length];
  useEffect(() => {
    if (upcoming?.kind === 'image') new Image().src = `/api/media/${upcoming.id}`;
  }, [upcoming?.id, upcoming?.kind]);

  // The previous item stays underneath while the new one fades in, so the change is a crossfade,
  // not a dip to black. Noted during render, so the very first frame of the new item is already fading.
  const [shown, setShown] = useState(step);
  const [previous, setPrevious] = useState<number | null>(null);
  if (shown !== step) {
    setPrevious(shown);
    setShown(step);
  }
  useEffect(() => {
    if (previous === null) return;
    const timer = setTimeout(() => setPrevious(null), FADE + 100);
    return () => clearTimeout(timer);
  }, [previous, step]);

  if (!current) return null;
  const layer = (at: number, top: boolean) => {
    const item = items[at % items.length];
    if (!item) return null;
    const src = `/api/media/${item.id}`;
    const fit = item.fit ?? defaultFit;
    const fade = top && previous !== null ? 'animate-[sign-fade-in_0.8s_ease]' : '';
    return item.kind === 'image' ? (
      <div key={at} className={`absolute inset-0 ${fade}`}>
        {/* When fitted whole, a blurred copy fills the sides instead of black bars. */}
        {fit === 'contain' && <img src={src} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-[2rem]" />}
        <img src={src} alt="" className={`absolute inset-0 size-full ${OBJECT_FIT[fit]}`} onError={top ? next : undefined} />
      </div>
    ) : (
      <video
        key={at}
        src={src}
        className={`absolute inset-0 size-full ${OBJECT_FIT[fit]} ${fade}`}
        autoPlay={top}
        muted
        playsInline
        loop={top && items.length === 1}
        onEnded={top ? next : undefined}
        onError={top ? next : undefined}
      />
    );
  };
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
      {previous !== null && previous !== step && layer(previous, false)}
      {layer(step, true)}
    </div>
  );
}

/** At night, instead of the carousel: just the time, in soft grey so it doesn't glare. */
export function NightClock({ now }: { now: number }) {
  const { time, period } = clockParts(now);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-slate-500">
      <span className="tabular text-[13rem] leading-none font-semibold tracking-tight">
        {time}
        <span className="ml-[0.15em] text-[0.3em] font-medium">{period}</span>
      </span>
      <span className="mt-[2rem] text-[2.6rem] font-medium text-slate-400">{formatDay(now)}</span>
    </div>
  );
}

/** Downloads the carousel in the background, so the service worker can play it offline. */
export function usePrefetchMedia(items: { id: number }[]): void {
  const key = items.map((m) => m.id).join(',');
  useEffect(() => {
    if (!navigator.serviceWorker?.controller) return;
    let cancelled = false;
    void (async () => {
      // One at a time, not to hog the network with several videos.
      for (const { id } of items) {
        if (cancelled) return;
        await fetch(`/api/media/${id}`).then((r) => r.blob()).catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);
}

/** Downloads the takeover images ahead of time so the service worker has them when their time comes, offline too. */
export function usePrefetchTakeovers(items: { id: number }[]): void {
  const key = items.map((t) => t.id).join(',');
  useEffect(() => {
    if (!navigator.serviceWorker?.controller) return;
    for (const { id } of items) void fetch(`/api/takeovers/${id}/image`).then((r) => r.blob()).catch(() => undefined);
  }, [key]);
}
