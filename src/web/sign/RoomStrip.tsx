import { isSameDay } from 'date-fns';
import type { Room, RoomStatusKind } from '../../shared/model.ts';
import type { RoomState } from '../../shared/status.ts';
import { Time } from './parts.tsx';
import { strings } from './strings.ts';

const LOOK: Record<RoomStatusKind, { tile: string; bar: string; text: string }> = {
  free: { tile: 'bg-free/8', bar: 'bg-free', text: 'text-free-deep' },
  occupied: { tile: 'bg-occupied/8', bar: 'bg-occupied', text: 'text-occupied-deep' },
  reserved: { tile: 'bg-reserved/12', bar: 'bg-reserved', text: 'text-reserved-deep' },
};

export function statusLabel(state: RoomState): string {
  return state.message ?? strings.status[state.status];
}

function RoomTile({ room, state, now }: { room: Room; state: RoomState; now: number }) {
  const look = LOOK[state.status];
  // Only say when the status changes if it's today; further ahead is noise.
  const changesAt = state.changesAt !== null && isSameDay(state.changesAt, now) ? state.changesAt : null;
  return (
    <div className={`relative flex min-w-0 flex-1 flex-col justify-center overflow-hidden rounded-[1rem] pr-[1rem] pl-[1.4rem] ${look.tile}`}>
      <span className={`absolute inset-y-0 left-0 w-[0.45rem] ${look.bar}`} />
      <div className="truncate text-[1.5rem] leading-tight font-semibold text-slate-900">{room.name}</div>
      <div className={`mt-[0.2rem] flex min-w-0 items-center gap-[0.5rem] text-[1.25rem] font-semibold ${look.text}`}>
        <span className={`size-[0.7rem] shrink-0 rounded-full ${look.bar}`} />
        <span className="truncate">{statusLabel(state)}</span>
      </div>
      <div className="mt-[0.1rem] h-[1.6rem] text-[1.1rem] font-medium text-slate-500">
        {changesAt !== null && (
          <>
            → <Time at={changesAt} />
          </>
        )}
      </div>
    </div>
  );
}

/** Always visible (SIGN-2): main rooms, then sub-rooms after a divider. */
export function RoomStrip({ rooms, statuses, now }: { rooms: Room[]; statuses: Map<number, RoomState>; now: number }) {
  const tile = (room: Room) => {
    const state = statuses.get(room.id);
    return state ? <RoomTile key={room.id} room={room} state={state} now={now} /> : null;
  };
  const main = rooms.filter((r) => r.kind === 'main');
  const sub = rooms.filter((r) => r.kind === 'sub');

  return (
    <footer className="flex h-[9.5rem] shrink-0 items-stretch gap-[0.9rem] bg-white px-[2.5rem] py-[1.4rem] shadow-[0_-0.15rem_0.6rem_rgb(16_80_140/0.06)]">
      {main.map(tile)}
      {main.length > 0 && sub.length > 0 && <div className="mx-[0.6rem] w-[0.15rem] shrink-0 rounded-full bg-slate-200" />}
      {sub.map(tile)}
    </footer>
  );
}
