import type { MediaFit, Room, Takeover } from '../../shared/model.ts';
import type { RoomState } from '../../shared/status.ts';
import { Header } from './Header.tsx';
import { RoomStrip } from './RoomStrip.tsx';

const OBJECT_FIT: Record<MediaFit, string> = { contain: 'object-contain', fill: 'object-fill', cover: 'object-cover' };

/**
 * A takeover as the sign draws it: the still image over the whole screen, between the header and the room
 * strip when those are on. The admin demo renders the same component at a fixed 96 × 54 rem.
 */
export function TakeoverView({
  src,
  fit,
  chrome,
  now,
  rooms,
  statuses,
  venueLogo,
  className = 'h-screen w-screen',
}: {
  src: string;
  fit: Takeover['fit'];
  chrome: { header: boolean; footer: boolean };
  now: number;
  rooms: Room[];
  statuses: Map<number, RoomState>;
  venueLogo: string | null;
  className?: string;
}) {
  return (
    <div className={`flex flex-col overflow-hidden bg-canvas ${className}`}>
      {chrome.header && <Header now={now} staleSince={null} logo={venueLogo} />}
      <main className="relative min-h-0 flex-1 overflow-hidden bg-black">
        {/* When fitted whole, a blurred copy fills the sides instead of black bars. */}
        {fit === 'contain' && <img src={src} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-[2rem]" />}
        <img src={src} alt="" className={`absolute inset-0 size-full ${OBJECT_FIT[fit]}`} />
      </main>
      {chrome.footer && <RoomStrip rooms={rooms} statuses={statuses} now={now} />}
    </div>
  );
}
