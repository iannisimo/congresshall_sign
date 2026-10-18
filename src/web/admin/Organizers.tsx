import { useMutation } from '@tanstack/react-query';
import { Plus, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Organizer } from '../../shared/model.ts';
import { api, ddgLogoSearch, errorMessage, keys, queryClient, refreshSchedule, useOrganizers } from './api.ts';
import { Logo } from '../sign/parts.tsx';
import { GenericLogoGallery, LogoUploader } from './OrganizerFields.tsx';
import { Button, Card, ErrorNote, Field, inputClass, PageLoading, useFeedback } from './ui.tsx';

function OrganizerDetail({ organizer, onDeleted }: { organizer: Organizer; onDeleted: () => void }) {
  const { confirm, toast } = useFeedback();
  const [name, setName] = useState(organizer.name);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.organizers });

  const rename = useMutation({
    mutationFn: () => api(`/organizers/${organizer.id}`, { method: 'PATCH', json: { name } }),
    onSuccess: () => {
      // The name appears on events, so the schedule changes too.
      refreshSchedule();
      toast('Nome aggiornato');
    },
  });
  const removeLogo = useMutation({
    mutationFn: (logoId: number) => api(`/logos/${logoId}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      toast('Logo eliminato');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const remove = useMutation({
    mutationFn: () => api(`/organizers/${organizer.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      toast('Organizzatore eliminato');
      onDeleted();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return (
    <Card className="space-y-6 p-5">
      <Field label="Nome" error={rename.isError ? errorMessage(rename.error) : undefined}>
        <div className="flex gap-2">
          <input className={inputClass} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          <Button variant="primary" disabled={!name.trim() || name.trim() === organizer.name} busy={rename.isPending} onClick={() => rename.mutate()}>
            Rinomina
          </Button>
        </div>
      </Field>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Loghi</span>
          <a href={ddgLogoSearch(organizer.name)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-800 hover:underline">
            <Search className="size-3.5" />
            Cerca online
          </a>
        </div>
        {organizer.logoIds.length > 0 && (
          <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {organizer.logoIds.map((id) => (
              <div key={id} className="group relative grid aspect-square place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
                <Logo logoId={id} name={organizer.name} className="size-full" />
                <button
                  type="button"
                  aria-label="Elimina logo"
                  onClick={async () => {
                    if (await confirm('Eliminare questo logo?', { confirmLabel: 'Elimina', danger: true })) removeLogo.mutate(id);
                  }}
                  className="absolute top-1 right-1 rounded-full bg-white p-1 text-slate-500 shadow ring-1 ring-slate-200 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <LogoUploader organizerId={organizer.id} />
        <div className="mt-3">
          <GenericLogoGallery organizerId={organizer.id} />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="text-sm text-slate-500">
          {organizer.eventCount === 0 ? 'Nessun evento' : organizer.eventCount === 1 ? '1 evento' : `${organizer.eventCount} eventi`}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="text-red-600!"
          disabled={organizer.eventCount > 0}
          title={organizer.eventCount > 0 ? 'Si può eliminare solo un organizzatore senza eventi' : undefined}
          busy={remove.isPending}
          onClick={async () => {
            if (await confirm(`Eliminare «${organizer.name}» e i suoi loghi?`, { confirmLabel: 'Elimina', danger: true })) remove.mutate();
          }}
        >
          <Trash2 className="size-4" />
          Elimina organizzatore
        </Button>
      </div>
    </Card>
  );
}

export default function Organizers() {
  const organizers = useOrganizers();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const selectedId = Number(params.get('id')) || null;

  const create = useMutation({
    mutationFn: (name: string) => api<Organizer>('/organizers', { method: 'POST', json: { name } }),
    onSuccess: (organizer) => {
      void queryClient.invalidateQueries({ queryKey: keys.organizers });
      setQuery('');
      setParams({ id: String(organizer.id) });
    },
  });

  if (organizers.isPending) return <PageLoading />;
  if (organizers.isError) return <ErrorNote>{errorMessage(organizers.error)}</ErrorNote>;

  const q = query.trim().toLowerCase();
  const list = organizers.data.filter((o) => o.name.toLowerCase().includes(q));
  const selected = organizers.data.find((o) => o.id === selectedId);
  const exact = organizers.data.some((o) => o.name.toLowerCase() === q);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Organizzatori</h1>
      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="space-y-2 border-b border-slate-100 p-3">
            <input className={inputClass} placeholder="Cerca o aggiungi…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {q && !exact && (
              <Button size="sm" variant="ghost" className="w-full justify-start!" busy={create.isPending} onClick={() => create.mutate(query.trim())}>
                <Plus className="size-4" />
                Aggiungi «{query.trim()}»
              </Button>
            )}
            {create.isError && <ErrorNote>{errorMessage(create.error)}</ErrorNote>}
          </div>
          <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-auto">
            {list.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setParams({ id: String(o.id) })}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${o.id === selectedId ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-white p-1 ring-1 ring-slate-200">
                    {o.logoIds[0] !== undefined ? (
                      <img src={`/api/logos/${o.logoIds[0]}`} alt="" className="max-h-full max-w-full object-contain" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{o.name}</span>
                    <span className="text-xs text-slate-500">
                      {o.eventCount === 1 ? '1 evento' : `${o.eventCount} eventi`} · {o.logoIds.length === 1 ? '1 logo' : `${o.logoIds.length} loghi`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">Nessun organizzatore.</li>}
          </ul>
        </Card>

        {selected ? (
          <OrganizerDetail key={selected.id} organizer={selected} onDeleted={() => setParams({})} />
        ) : (
          <Card className="grid place-items-center p-10 text-sm text-slate-500">Scegli un organizzatore per gestirne nome e loghi.</Card>
        )}
      </div>
    </div>
  );
}
