import { isSameDay } from 'date-fns';
import { WifiOff } from 'lucide-react';
import logo from '../assets/logo-small.svg';
import { formatDay } from '../lib/format.ts';
import { Time } from './parts.tsx';
import { strings } from './strings.ts';

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.();
}

export function Header({ venueName, now, staleSince }: { venueName: string; now: number; staleSince: number | null }) {
  return (
    <header className="relative flex h-[7.75rem] shrink-0 items-center bg-white px-[2.5rem] shadow-[0_0.15rem_0.6rem_rgb(16_80_140/0.06)]">
      <div className="flex-1 truncate text-[2.3rem] font-semibold tracking-tight text-brand-900">{venueName}</div>
      <img src={logo} alt="" className="h-[6.5rem]" onClick={toggleFullscreen} />
      <div className="flex flex-1 items-center justify-end gap-[1.5rem]">
        {staleSince !== null && (
          <span className="flex items-center gap-[0.5rem] rounded-full bg-reserved/15 px-[0.9rem] py-[0.3rem] text-[1.1rem] font-semibold text-reserved-deep">
            <WifiOff className="size-[1.2rem]" strokeWidth={2.5} />
            {strings.lastUpdate} {!isSameDay(staleSince, now) && `${formatDay(staleSince)},`} <Time at={staleSince} />
          </span>
        )}
        <span className="text-[1.6rem] font-medium text-slate-500">{formatDay(now)}</span>
        <Time at={now} className="text-[3.3rem] leading-none font-semibold tracking-tight text-brand-950" periodClassName="text-slate-500" />
      </div>
      <span className="absolute inset-x-0 bottom-0 h-[0.25rem] bg-gradient-to-r from-brand-900 via-brand-700 to-brand-900" />
    </header>
  );
}
