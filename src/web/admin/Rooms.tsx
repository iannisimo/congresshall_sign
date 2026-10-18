import { useMutation } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Room, RoomKind } from '../../shared/model.ts';
import type { RoomInput } from '../../shared/schemas.ts';
import { strings } from '../sign/strings.ts';
import { api, errorMessage, keys, queryClient, useRooms } from './api.ts';
import { Badge, Button, Card, Dialog, ErrorNote, Field, inputClass, PageLoading, useFeedback } from './ui.tsx';

function refreshRooms() {
  void queryClient.invalidateQueries({ queryKey: keys.rooms });
  void queryClient.invalidateQueries({ queryKey: keys.display });
}

function RoomDialog({ room, rooms, onClose }: { room: Room | 'new' | null; rooms: Room[]; onClose: () => void }) {
  const { toast } = useFeedback();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<RoomKind>('main');
  const [parentIds, setParentIds] = useState<number[]>([]);
  const [blockedMessage, setBlockedMessage] = useState('');

  useEffect(() => {
    if (room === null) return;
    const existing = room === 'new' ? null : room;
    setName(existing?.name ?? '');
    setKind(existing?.kind ?? 'main');
    setParentIds(existing?.parentIds ?? []);
    setBlockedMessage(existing?.blockedMessage ?? '');
  }, [room]);

  const save = useMutation({
    mutationFn: () => {
      const body: RoomInput = {
        name,
        kind,
        parentIds: kind === 'sub' ? parentIds : [],
        blockedMessage: kind === 'sub' ? blockedMessage.trim() || null : null,
      };
      return room === 'new' || room === null
        ? api('/rooms', { method: 'POST', json: body })
        : api(`/rooms/${room.id}`, { method: 'PUT', json: body });
    },
    onSuccess: () => {
      refreshRooms();
      toast('Sala salvata');
      onClose();
    },
  });

  const parents = rooms.filter((r) => r.kind === 'main' && (room === 'new' || r.id !== room?.id));

  return (
    <Dialog
      open={room !== null}
      onClose={onClose}
      title={room === 'new' ? 'Nuova sala' : `Modifica ${room?.name ?? ''}`}
      footer={
        <>
          <Button onClick={onClose}>Annulla</Button>
          <Button variant="primary" busy={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>
            Salva
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Nome">
          <input className={inputClass} value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} />
        </Field>
        <fieldset className="space-y-2 text-sm">
          <legend className="mb-1.5 font-medium text-slate-700">Tipo</legend>
          <label className="flex items-start gap-2">
            <input type="radio" className="mt-1" checked={kind === 'main'} onChange={() => setKind('main')} />
            <span>
              <span className="font-medium text-slate-900">Sala principale</span>
              <span className="block text-slate-500">Si prenota per gli eventi.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" className="mt-1" checked={kind === 'sub'} onChange={() => setKind('sub')} />
            <span>
              <span className="font-medium text-slate-900">Sottosala</span>
              <span className="block text-slate-500">Non si prenota: risulta riservata mentre è in corso un evento nelle sue sale principali.</span>
            </span>
          </label>
        </fieldset>
        {kind === 'sub' && (
          <>
            <Field label="Sale principali">
              <div className="flex flex-wrap gap-2">
                {parents.map((p) => {
                  const on = parentIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setParentIds(on ? parentIds.filter((id) => id !== p.id) : [...parentIds, p.id])}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ${on ? 'bg-brand-900 text-white ring-brand-900' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Messaggio quando una sala principale è in uso" hint="Mostrato sul cartello; meglio parole comprensibili a tutti.">
              <input
                className={inputClass}
                value={blockedMessage}
                maxLength={120}
                placeholder={strings.status.reserved}
                onChange={(e) => setBlockedMessage(e.target.value)}
              />
            </Field>
          </>
        )}
        {save.isError && <ErrorNote>{errorMessage(save.error)}</ErrorNote>}
      </div>
    </Dialog>
  );
}

/** Room management for the superadmin (ROOM-5). */
export default function Rooms() {
  const rooms = useRooms();
  const { confirm, toast } = useFeedback();
  const [editing, setEditing] = useState<Room | 'new' | null>(null);

  const reorder = useMutation({
    mutationFn: (ids: number[]) => api<Room[]>('/rooms/order', { method: 'PUT', json: { ids } }),
    onMutate: (ids) => {
      const byId = new Map((rooms.data ?? []).map((r) => [r.id, r]));
      queryClient.setQueryData<Room[]>(keys.rooms, ids.flatMap((id) => byId.get(id) ?? []));
    },
    onSettled: refreshRooms,
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/rooms/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refreshRooms();
      toast('Sala eliminata');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  if (rooms.isPending) return <PageLoading />;
  if (rooms.isError) return <ErrorNote>{errorMessage(rooms.error)}</ErrorNote>;

  const list = rooms.data;
  const names = new Map(list.map((r) => [r.id, r.name]));
  const move = (index: number, by: number) => {
    const ids = list.map((r) => r.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + by, 0, moved!);
    reorder.mutate(ids);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Sale</h1>
          <p className="text-sm text-slate-500">L’ordine è quello del cartello: prima le sale principali, poi le sottosale.</p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus className="size-4" />
          Nuova sala
        </Button>
      </div>

      <Card>
        {list.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">Nessuna sala. Aggiungi la prima.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((room, i) => (
              <li key={room.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex flex-col">
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" aria-label="Sposta su">
                    <ArrowUp className="size-4" />
                  </button>
                  <button type="button" disabled={i === list.length - 1} onClick={() => move(i, 1)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" aria-label="Sposta giù">
                    <ArrowDown className="size-4" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-slate-900">{room.name}</span>
                    <Badge tone={room.kind === 'main' ? 'brand' : 'slate'}>{room.kind === 'main' ? 'Principale' : 'Sottosala'}</Badge>
                  </div>
                  {room.kind === 'sub' && (
                    <div className="truncate text-sm text-slate-500">
                      di {room.parentIds.map((id) => names.get(id)).join(', ') || '—'} · «{room.blockedMessage ?? strings.status.reserved}»
                    </div>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditing(room)} aria-label="Modifica">
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Elimina"
                  onClick={async () => {
                    if (await confirm(`Eliminare la sala «${room.name}»?`, { confirmLabel: 'Elimina', danger: true })) remove.mutate(room.id);
                  }}
                >
                  <Trash2 className="size-4 text-red-600" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <RoomDialog room={editing} rooms={list} onClose={() => setEditing(null)} />
    </div>
  );
}
