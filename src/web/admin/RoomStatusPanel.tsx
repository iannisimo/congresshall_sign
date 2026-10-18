import { useMutation } from '@tanstack/react-query';
import { isSameDay } from 'date-fns';
import { useEffect, useState } from 'react';
import type { Room, RoomStatusKind } from '../../shared/model.ts';
import type { OverrideInput } from '../../shared/schemas.ts';
import { computeRoomStatuses, type StatusReason } from '../../shared/status.ts';
import { DAY } from '../../shared/time.ts';
import { formatAdminShortDay, formatAdminTime } from '../lib/format.ts';
import { strings } from '../sign/strings.ts';
import { api, errorMessage, keys, queryClient, useDisplay } from './api.ts';
import { atTime, toDateValue, toTimeValue } from './dates.ts';
import { Button, Card, Dialog, ErrorNote, Field, inputClass, Spinner, STATUS_LABELS, StatusDot, useFeedback } from './ui.tsx';

const REASONS: Record<StatusReason, string> = {
  idle: 'Nessun evento',
  prep: 'Preparazione',
  event: 'Evento in corso',
  cleanup: 'Riordino dopo l’evento',
  parent: 'Sala principale in uso',
  override: 'Impostato a mano',
};

function untilText(t: number, now: number): string {
  return isSameDay(t, now) ? `fino alle ${formatAdminTime(t)}` : `fino a ${formatAdminShortDay(t)} ${formatAdminTime(t)}`;
}

function useMinuteClock(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

type Until = 'next-change' | 'time' | 'manual';

/** Forces a room's status (ROOM-4). */
function OverrideDialog({ room, onClose }: { room: Room | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const [status, setStatus] = useState<RoomStatusKind>('reserved');
  const [message, setMessage] = useState('');
  const [until, setUntil] = useState<Until>('next-change');
  const [time, setTime] = useState(() => toTimeValue(Date.now() + 2 * 3600_000));

  useEffect(() => {
    if (!room) return;
    setStatus('reserved');
    setMessage('');
    setUntil('next-change');
  }, [room]);

  const save = useMutation({
    mutationFn: () => {
      let at = atTime(toDateValue(Date.now()), time) ?? 0;
      if (at <= Date.now()) at += DAY; // a time already past today means tomorrow
      const body: OverrideInput = {
        status,
        message: message.trim() || null,
        until: until === 'time' ? { kind: 'time', at } : { kind: until },
      };
      return api(`/rooms/${room!.id}/override`, { method: 'PUT', json: body });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.display });
      toast('Stato aggiornato');
      onClose();
    },
  });

  return (
    <Dialog
      open={room !== null}
      onClose={onClose}
      title={`Stato di ${room?.name ?? ''}`}
      footer={
        <>
          <Button onClick={onClose}>Annulla</Button>
          <Button variant="primary" busy={save.isPending} onClick={() => save.mutate()}>
            Imposta
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2">
          {(['free', 'reserved', 'occupied'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ring-1 ${status === s ? 'bg-brand-50 ring-2 ring-brand-600' : 'ring-slate-300 hover:bg-slate-50'}`}
            >
              <StatusDot status={s} />
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <Field label="Testo sul cartello" hint={`Facoltativo. Se vuoto: “${strings.status[status]}”. Meglio parole comprensibili a tutti.`}>
          <input className={inputClass} value={message} maxLength={80} onChange={(e) => setMessage(e.target.value)} placeholder={strings.status[status]} />
        </Field>
        <fieldset className="space-y-2 text-sm">
          <legend className="mb-1.5 font-medium text-slate-700">Fino a quando</legend>
          <label className="flex items-center gap-2">
            <input type="radio" checked={until === 'next-change'} onChange={() => setUntil('next-change')} />
            Fino al prossimo cambio previsto dal programma
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={until === 'time'} onChange={() => setUntil('time')} />
            Fino alle
            <input
              type="time"
              className={`${inputClass} w-28! py-1!`}
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                setUntil('time');
              }}
            />
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={until === 'manual'} onChange={() => setUntil('manual')} />
            Finché non lo ripristino
          </label>
        </fieldset>
        {save.isError && <ErrorNote>{errorMessage(save.error)}</ErrorNote>}
      </div>
    </Dialog>
  );
}

/** What the sign shows for each room right now, with manual overrides. */
export function RoomStatusPanel() {
  const display = useDisplay();
  const now = useMinuteClock();
  const { toast } = useFeedback();
  const [editing, setEditing] = useState<Room | null>(null);
  const reset = useMutation({
    mutationFn: (roomId: number) => api(`/rooms/${roomId}/override`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.display });
      toast('Stato ripristinato');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const snapshot = display.data;
  const statuses = snapshot && computeRoomStatuses({ ...snapshot, now });

  return (
    <Card>
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Sale adesso</h2>
        <p className="text-xs text-slate-500">Come appaiono sul cartello</p>
      </div>
      {!snapshot || !statuses ? (
        <div className="grid place-items-center py-10">
          <Spinner />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {snapshot.rooms.map((room) => {
            const state = statuses.get(room.id);
            if (!state) return null;
            return (
              <li key={room.id} className="flex items-center gap-3 px-4 py-3">
                <StatusDot status={state.status} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">{room.name}</div>
                  <div className="text-xs text-slate-500">
                    {state.message ?? STATUS_LABELS[state.status]} · {REASONS[state.reason]}
                    {state.changesAt !== null && ` · ${untilText(state.changesAt, now)}`}
                  </div>
                </div>
                {state.reason === 'override' ? (
                  <Button size="sm" variant="ghost" busy={reset.isPending && reset.variables === room.id} onClick={() => reset.mutate(room.id)}>
                    Ripristina
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(room)}>
                    Cambia
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <OverrideDialog room={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}
