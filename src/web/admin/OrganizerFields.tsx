import { useMutation } from '@tanstack/react-query';
import { Check, ImagePlus, Plus, Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { Organizer } from '../../shared/model.ts';
import { api, ddgLogoSearch, errorMessage, keys, queryClient } from './api.ts';
import { Button, inputClass, Spinner, useFeedback } from './ui.tsx';

/** Finds a link to an image in something dragged from another web page. */
function draggedImageUrl(data: DataTransfer): string | null {
  const html = data.getData('text/html');
  const fromHtml = html ? new DOMParser().parseFromString(html, 'text/html').querySelector('img')?.getAttribute('src') : null;
  const fromList = data.getData('text/uri-list').split(/\r?\n/).find((line) => line && !line.startsWith('#'));
  const candidate = (fromHtml || fromList || data.getData('text/plain')).trim();
  return /^https?:\/\//i.test(candidate) ? candidate : null;
}

/**
 * Adds a logo to an organizer's library (ADMIN-10): drop a file or an image from another page, paste
 * an image, pick a file, or give a URL. The server checks and shrinks it (ADMIN-11).
 */
export function LogoUploader({ organizerId, onUploaded }: { organizerId: number; onUploaded?: (logoId: number) => void }) {
  const { toast } = useFeedback();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState('');

  const upload = useMutation({
    mutationFn: (source: File | string) => {
      const path = `/organizers/${organizerId}/logos`;
      if (typeof source === 'string') return api<{ id: number }>(path, { method: 'POST', json: { url: source } });
      const form = new FormData();
      form.append('file', source);
      return api<{ id: number }>(path, { method: 'POST', form });
    },
    onSuccess: ({ id }) => {
      void queryClient.invalidateQueries({ queryKey: keys.organizers });
      setUrl('');
      toast('Logo caricato');
      onUploaded?.(id);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const { mutate } = upload;

  // Pasting an image anywhere on the page uploads it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (!file) return;
      e.preventDefault();
      mutate(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [mutate]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
    const link = file ? null : draggedImageUrl(e.dataTransfer);
    if (file) mutate(file);
    else if (link) mutate(link);
    else toast('Non è un’immagine', 'error');
  };

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 text-center text-sm transition-colors ${dragging ? 'border-brand-600 bg-brand-50 text-brand-900' : 'border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-slate-50'}`}
      >
        {upload.isPending ? (
          <Spinner />
        ) : (
          <>
            <ImagePlus className="size-6 text-slate-400" />
            <span>
              Trascina qui un’immagine, incollala con <kbd className="rounded bg-slate-100 px-1 font-sans text-xs">Ctrl+V</kbd> o
              clicca per sceglierla
            </span>
          </>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) mutate(file);
          e.target.value = '';
        }}
      />
      <div className="flex gap-2">
        <input
          type="url"
          className={inputClass}
          placeholder="…oppure l’indirizzo di un’immagine"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && url.trim()) {
              e.preventDefault();
              mutate(url.trim());
            }
          }}
        />
        <Button onClick={() => url.trim() && mutate(url.trim())} disabled={!url.trim()} busy={upload.isPending && typeof upload.variables === 'string'}>
          Carica
        </Button>
      </div>
    </div>
  );
}

/** Choose an existing organizer or create one by typing its name. */
export function OrganizerPicker({
  organizers,
  value,
  onChange,
}: {
  organizers: Organizer[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const { toast } = useFeedback();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = organizers.find((o) => o.id === value);

  const create = useMutation({
    mutationFn: (name: string) => api<Organizer>('/organizers', { method: 'POST', json: { name } }),
    onSuccess: (organizer) => {
      void queryClient.invalidateQueries({ queryKey: keys.organizers });
      queryClient.setQueryData<Organizer[]>(keys.organizers, (list) =>
        list?.some((o) => o.id === organizer.id) ? list : [...(list ?? []), organizer],
      );
      onChange(organizer.id);
      setQuery('');
      setOpen(false);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 ring-1 ring-brand-200">
        <Check className="size-4 text-brand-700" />
        <span className="flex-1 truncate font-medium text-brand-950">{selected.name}</span>
        <button type="button" onClick={() => onChange(null)} className="rounded p-0.5 text-brand-700 hover:bg-brand-100" aria-label="Cambia organizzatore">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const matches = organizers.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 8);
  const exact = organizers.some((o) => o.name.toLowerCase() === q);
  const options = [
    ...matches.map((o) => ({ key: `o${o.id}`, label: o.name, pick: () => onChange(o.id) })),
    ...(q && !exact ? [{ key: 'new', label: `Crea «${query.trim()}»`, pick: () => create.mutate(query.trim()) }] : []),
  ];

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <input
        className={`${inputClass} pl-9`}
        placeholder="Cerca o scrivi un nuovo nome…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, options.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter') {
            e.preventDefault();
            options[active]?.pick();
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {create.isPending && <Spinner className="absolute top-1/2 right-3 -translate-y-1/2" />}
      {open && options.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-900/10">
          {options.map((option, i) => (
            <li key={option.key}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={option.pick}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${i === active ? 'bg-brand-50 text-brand-950' : 'text-slate-700'}`}
              >
                {option.key === 'new' && <Plus className="size-4 text-brand-700" />}
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The organizer's logos, to pick one for the event, plus upload and a web search shortcut. */
export function LogoPicker({
  organizer,
  value,
  onChange,
}: {
  organizer: Organizer;
  value: number | null;
  onChange: (logoId: number | null) => void;
}) {
  const tile = 'relative grid aspect-square place-items-center rounded-lg bg-white p-2 ring-1 transition-shadow';
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`${tile} text-xs text-slate-500 ${value === null ? 'ring-2 ring-brand-600' : 'ring-slate-200 hover:ring-slate-300'}`}
        >
          Nessun logo
        </button>
        {organizer.logoIds.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`${tile} ${value === id ? 'ring-2 ring-brand-600' : 'ring-slate-200 hover:ring-slate-300'}`}
          >
            <img src={`/api/logos/${id}`} alt="" className="max-h-full max-w-full object-contain" />
            {value === id && <Check className="absolute top-1 right-1 size-4 rounded-full bg-brand-600 p-0.5 text-white" />}
          </button>
        ))}
      </div>
      <LogoUploader organizerId={organizer.id} onUploaded={onChange} />
      <a
        href={ddgLogoSearch(organizer.name)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-800 hover:underline"
      >
        <Search className="size-3.5" />
        Cerca il logo online
      </a>
    </div>
  );
}
