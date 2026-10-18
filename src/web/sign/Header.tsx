import { isSameDay } from 'date-fns';
import { WifiOff } from 'lucide-react';
import { formatDay } from '../lib/format.ts';
import { Time, VenueLogo } from './parts.tsx';
import { strings } from './strings.ts';

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.();
}

/** Small "last update" note: noticeable for staff, not alarming for guests. */
export function StalePill({ since, now, className = '' }: { since: number; now: number; className?: string }) {
  return (
    <span className={`flex items-center gap-[0.35rem] rounded-full px-[0.6rem] py-[0.1rem] text-[0.85rem] font-semibold text-reserved-deep ${className}`}>
      <WifiOff className="size-[0.9rem]" strokeWidth={2.5} />
      {strings.lastUpdate} {!isSameDay(since, now) && `${formatDay(since)},`} <Time at={since} />
    </span>
  );
}

export function Header({ now, staleSince, logo }: { now: number; staleSince: number | null; logo: string | null }) {
  return (
    <header className="relative flex h-[7.75rem] shrink-0 items-center bg-white px-[2.5rem] shadow-[0_0.15rem_0.6rem_rgb(16_80_140/0.06)]">
      <VenueLogo version={logo} className="venue-logo h-[6.5rem]" onClick={toggleFullscreen} />
      {staleSince !== null && <StalePill since={staleSince} now={now} className="absolute top-[0.45rem] right-[2.5rem] bg-reserved/15" />}
      <div className="flex flex-1 items-center justify-end gap-[1.5rem]">
        <span className="text-[1.6rem] font-medium text-slate-500">{formatDay(now)}</span>
        <Time at={now} className="text-[3.3rem] leading-none font-semibold tracking-tight text-brand-950" periodClassName="text-slate-500" />
      </div>
      <span className="absolute inset-x-0 bottom-0 h-[0.25rem] bg-gradient-to-r from-brand-900 via-brand-700 to-brand-900" />
    </header>
  );
}
