import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy, ExternalLink, Film, GripVertical, Image as ImageIcon, Plus, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useSearchParams } from 'react-router';
import type { MediaFit, MediaItem, MediaPreset, Settings } from '../../shared/model.ts';
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from '../../shared/settings.ts';
import { api, errorMessage, HttpError, keys, queryClient, useSettings } from './api.ts';
import { NumberWithSlider } from './Settings.tsx';
import { Badge, Button, buttonClass, Card, ErrorNote, Field, inputClass, PageLoading, useFeedback } from './ui.tsx';

const mediaKey = ['media'] as const;
const presetsKey = ['media-presets'] as const;

const FITS: { value: MediaFit; label: string; description: string }[] = [
  { value: 'contain', label: 'Adatta', description: 'Tutto visibile, ai lati lo sfondo sfocato' },
  { value: 'fill', label: 'Estendi', description: 'Riempie lo spazio, deformando se serve' },
  { value: 'cover', label: 'Riempi', description: 'Riempie lo spazio tagliando i bordi' },
];
const fitLabel = (fit: MediaFit) => FITS.find((f) => f.value === fit)!.label;

function refresh() {
  void queryClient.invalidateQueries({ queryKey: mediaKey });
  void queryClient.invalidateQueries({ queryKey: presetsKey });
  void queryClient.invalidateQueries({ queryKey: keys.display });
}

/** Uploads with XMLHttpRequest, which (unlike fetch) reports upload progress: videos can be big. */
function uploadFile(file: File, presetId: number, onProgress: (fraction: number) => void): Promise<MediaItem> {
  return new Promise((resolve, reject) => {
    // The server cuts the connection of an oversized upload, which the browser reports as an unreachable server.
    const isImage = file.type.startsWith('image/');
    const limit = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (file.size > limit) {
      reject(new HttpError(413, { error: `${isImage ? 'Immagine' : 'Video'} troppo grande (${formatSize(file.size)}, max ${formatSize(limit)})` }));
      return;
    }
    const request = new XMLHttpRequest();
    request.open('POST', '/api/media');
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    request.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    request.setRequestHeader('X-Preset-Id', String(presetId));
    request.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    request.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(request.responseText);
      } catch {
        // not JSON
      }
      if (request.status === 201) resolve(body as MediaItem);
      else reject(new HttpError(request.status, body as { error: string } | null));
    };
    request.onerror = () => reject(new HttpError(0, { error: 'Server non raggiungibile' }));
    request.send(file);
  });
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

/** Image duration and the fit used by items without their own. */
function CarouselSettings({ settings }: { settings: Settings }) {
  const { toast } = useFeedback();
  const [seconds, setSeconds] = useState(settings.carouselImageSeconds);
  const [fit, setFit] = useState(settings.carouselFit);
  useEffect(() => {
    setSeconds(settings.carouselImageSeconds);
    setFit(settings.carouselFit);
  }, [settings.carouselImageSeconds, settings.carouselFit]);
  const valid = Number.isInteger(seconds) && seconds >= 2 && seconds <= 600;
  const changed = seconds !== settings.carouselImageSeconds || fit !== settings.carouselFit;
  const save = useMutation({
    mutationFn: () => api<Settings>('/settings/carousel', { method: 'PUT', json: { carouselImageSeconds: seconds, carouselFit: fit } }),
    onSuccess: (saved) => {
      queryClient.setQueryData(keys.settings, saved);
      void queryClient.invalidateQueries({ queryKey: keys.display });
      toast('Impostazioni del carosello salvate');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return (
    <Card className="space-y-5 p-5">
      <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Impostazioni generali del carosello</h2>
      <Field label="Durata di ogni immagine" hint="Vale per i preset senza una durata propria. I video restano finché non finiscono.">
        <NumberWithSlider value={seconds} onChange={setSeconds} min={2} max={60} step={1} unit="secondi" />
      </Field>
      <Field label="Adattamento allo schermo" hint="Vale per i preset e i file senza un adattamento proprio.">
        <div className="grid gap-2 sm:grid-cols-3">
          {FITS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFit(option.value)}
              className={`rounded-lg px-4 py-3 text-left ring-1 ${fit === option.value ? 'bg-brand-50 ring-2 ring-brand-600' : 'bg-white ring-slate-300 hover:bg-slate-50'}`}
            >
              <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
              <span className="mt-0.5 block text-xs text-slate-600">{option.description}</span>
            </button>
          ))}
        </div>
      </Field>
      <div className="flex justify-end">
        <Button variant="primary" disabled={!changed || !valid} busy={save.isPending} onClick={() => save.mutate()}>
          Salva
        </Button>
      </div>
    </Card>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand-700' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

const signUrl = (path: string, preset: MediaPreset) => `${location.origin}${path}${preset.isDefault ? '' : `?preset=${preset.name}`}`;

/** Label, URL name, image duration and fit of one preset, plus make-default and delete. */
function PresetSettings({ preset, presets, settings, onGone }: { preset: MediaPreset; presets: MediaPreset[]; settings: Settings; onGone: (name: string) => void }) {
  const { confirm, toast } = useFeedback();
  const [label, setLabel] = useState(preset.label);
  const [name, setName] = useState(preset.name);
  const [seconds, setSeconds] = useState<string>(preset.imageSeconds === null ? '' : String(preset.imageSeconds));
  const [fit, setFit] = useState<MediaFit | ''>(preset.fit ?? '');
  useEffect(() => {
    setLabel(preset.label);
    setName(preset.name);
    setSeconds(preset.imageSeconds === null ? '' : String(preset.imageSeconds));
    setFit(preset.fit ?? '');
  }, [preset.id, preset.label, preset.name, preset.imageSeconds, preset.fit]);

  const secondsValue = seconds === '' ? null : Number(seconds);
  const nameOk = /^[a-z0-9-]{1,40}$/.test(name);
  const secondsOk = secondsValue === null || (Number.isInteger(secondsValue) && secondsValue >= 2 && secondsValue <= 600);
  const nameTaken = presets.some((p) => p.id !== preset.id && p.name === name);
  const changed = label !== preset.label || name !== preset.name || secondsValue !== preset.imageSeconds || (fit || null) !== preset.fit;

  const save = useMutation({
    mutationFn: () => api<MediaPreset>(`/media-presets/${preset.id}`, { method: 'PATCH', json: { label: label.trim(), name, imageSeconds: secondsValue, fit: fit || null } }),
    onSuccess: (saved) => {
      refresh();
      if (saved.name !== preset.name) onGone(saved.name);
      toast('Preset salvato');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const makeDefault = useMutation({
    mutationFn: () => api(`/media-presets/${preset.id}/default`, { method: 'PUT' }),
    onSuccess: refresh,
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const remove = useMutation({
    mutationFn: () => api(`/media-presets/${preset.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      onGone('');
      toast('Preset eliminato');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const urls = [
    { path: '/', label: 'Cartello' },
    { path: '/carousel', label: 'Anteprima' },
  ];
  return (
    <Card className="space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" error={label.trim() ? undefined : 'Scrivi un nome'}>
          <input className={inputClass} value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field
          label="Nome nell’indirizzo"
          error={name && !nameOk ? 'Da 1 a 40 lettere minuscole, cifre o trattini' : nameTaken ? 'Esiste già un preset con questo nome' : undefined}
          hint={preset.isDefault ? 'Il preset predefinito non si può rinominare.' : undefined}
        >
          <input className={inputClass} value={name} disabled={preset.isDefault} onChange={(e) => setName(e.target.value.toLowerCase())} />
        </Field>
        <Field label="Durata di ogni immagine" error={secondsOk ? undefined : 'Da 2 a 600 secondi'}>
          <div className="flex items-center gap-2">
            <input
              className={inputClass}
              type="number"
              min={2}
              max={600}
              value={seconds}
              placeholder={`Come impostazione generale (${settings.carouselImageSeconds})`}
              onChange={(e) => setSeconds(e.target.value)}
            />
            {seconds !== '' && (
              <Button size="sm" variant="ghost" aria-label="Usa l’impostazione generale" onClick={() => setSeconds('')}>
                <X className="size-4" />
              </Button>
            )}
          </div>
        </Field>
        <Field label="Adattamento allo schermo">
          <select className={inputClass} value={fit} onChange={(e) => setFit(e.target.value as MediaFit | '')}>
            <option value="">Come impostazione generale ({fitLabel(settings.carouselFit)})</option>
            {FITS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="space-y-2">
        {urls.map(({ path, label: what }) => {
          const url = signUrl(path, preset);
          return (
            <div key={path} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-sm text-slate-500">{what}</span>
              <code className="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1.5 text-sm text-slate-700">{url}</code>
              <Button
                size="sm"
                aria-label="Copia l’indirizzo"
                title="Copia l’indirizzo"
                onClick={() => void navigator.clipboard?.writeText(url).then(() => toast('Indirizzo copiato'), () => toast('Copia non riuscita', 'error'))}
              >
                <Copy className="size-4" />
              </Button>
              <a href={url} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')} title="Apri">
                <ExternalLink className="size-4" />
              </a>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {!preset.isDefault && (
            <>
              <Button busy={makeDefault.isPending} onClick={() => makeDefault.mutate()}>
                Rendi predefinito
              </Button>
              <Button
                variant="danger"
                busy={remove.isPending}
                onClick={async () => {
                  if (await confirm(`Eliminare il preset «${preset.label}»? I file restano nella libreria.`, { confirmLabel: 'Elimina', danger: true })) remove.mutate();
                }}
              >
                <Trash2 className="size-4" />
                Elimina preset
              </Button>
            </>
          )}
        </div>
        <Button variant="primary" disabled={!changed || !label.trim() || !nameOk || nameTaken || !secondsOk} busy={save.isPending} onClick={() => save.mutate()}>
          Salva
        </Button>
      </div>
    </Card>
  );
}

function NewPreset({ current, onCreated, onCancel }: { current: MediaPreset; onCreated: (name: string) => void; onCancel: () => void }) {
  const { toast } = useFeedback();
  const [label, setLabel] = useState('');
  const [name, setName] = useState('');
  const [copy, setCopy] = useState(false);
  const slug = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const [nameEdited, setNameEdited] = useState(false);
  const create = useMutation({
    mutationFn: () => api<MediaPreset>('/media-presets', { method: 'POST', json: { name, label: label.trim(), ...(copy ? { copyFrom: current.id } : {}) } }),
    onSuccess: (created) => {
      refresh();
      onCreated(created.name);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const valid = label.trim() !== '' && /^[a-z0-9-]{1,40}$/.test(name);
  return (
    <Card className="space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome">
          <input
            className={inputClass}
            autoFocus
            value={label}
            maxLength={60}
            placeholder="Es. Bar"
            onChange={(e) => {
              setLabel(e.target.value);
              if (!nameEdited) setName(slug(e.target.value));
            }}
          />
        </Field>
        <Field label="Nome nell’indirizzo" hint="Lettere minuscole, cifre e trattini.">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => {
              setNameEdited(true);
              setName(e.target.value.toLowerCase());
            }}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
        Parti da una copia di «{current.label}»
      </label>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Annulla</Button>
        <Button variant="primary" disabled={!valid} busy={create.isPending} onClick={() => create.mutate()}>
          Crea preset
        </Button>
      </div>
    </Card>
  );
}

/** Carousel presets: which images and videos a sign shows when no event is planned (superadmin and media). */
export default function Media() {
  const { confirm, toast } = useFeedback();
  const [params, setParams] = useSearchParams();
  const media = useQuery({ queryKey: mediaKey, queryFn: () => api<MediaItem[]>('/media') });
  const presets = useQuery({ queryKey: presetsKey, queryFn: () => api<MediaPreset[]>('/media-presets') });
  const settings = useSettings();
  const fileInput = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);
  const [creating, setCreating] = useState(false);
  /** Order shown while dragging, before it's saved. */
  const [dragOrder, setDragOrder] = useState<number[] | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const selectPreset = (name: string) => setParams(name ? { preset: name } : {}, { replace: true });
  const preset = presets.data?.find((p) => p.name === params.get('preset')) ?? presets.data?.find((p) => p.isDefault);

  const saveItems = useMutation({
    mutationFn: ({ id, items }: { id: number; items: MediaPreset['items'] }) =>
      api<MediaPreset>(`/media-presets/${id}/items`, { method: 'PUT', json: { items } }),
    onSettled: refresh,
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/media/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      toast('Eliminato');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  /** Optimistic: show the new list at once, the server answer replaces it. */
  function setItems(items: MediaPreset['items']) {
    if (!preset) return;
    queryClient.setQueryData<MediaPreset[]>(presetsKey, (list) => list?.map((p) => (p.id === preset.id ? { ...p, items } : p)));
    saveItems.mutate({ id: preset.id, items });
  }
  function patchItem(mediaId: number, change: Partial<MediaPreset['items'][number]>) {
    setItems(preset!.items.map((i) => (i.mediaId === mediaId ? { ...i, ...change } : i)));
  }

  async function upload(files: FileList) {
    if (!preset) return;
    for (const file of [...files]) {
      setUploading({ name: file.name, progress: 0 });
      try {
        await uploadFile(file, preset.id, (progress) => setUploading({ name: file.name, progress }));
        toast(`${file.name} caricato`);
      } catch (error) {
        toast(`${file.name}: ${errorMessage(error)}`, 'error');
      }
    }
    setUploading(null);
    refresh();
  }

  /** Drag by the handle with mouse, pen or finger: rows move as the pointer passes their middle. */
  function startDrag(e: ReactPointerEvent, id: number) {
    e.preventDefault();
    const initial = preset!.items.map((i) => i.mediaId);
    let current = initial;
    setDragOrder(current);
    setDragging(id);
    const move = (event: PointerEvent) => {
      const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-media-id]') ?? [])];
      // Position = how many other rows have their middle above the pointer.
      const target = rows.filter((row) => Number(row.dataset['mediaId']) !== id && row.getBoundingClientRect().top + row.offsetHeight / 2 < event.clientY).length;
      const without = current.filter((x) => x !== id);
      const next = [...without.slice(0, target), id, ...without.slice(target)];
      if (next.join() !== current.join()) {
        current = next;
        setDragOrder(next);
      }
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      setDragging(null);
      setDragOrder(null);
      if (current.join() !== initial.join()) reorder(current);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  function reorder(ids: number[]) {
    const byId = new Map(preset!.items.map((i) => [i.mediaId, i]));
    setItems(ids.flatMap((id) => byId.get(id) ?? []));
  }

  if (media.isPending || presets.isPending || settings.isPending) return <PageLoading />;
  if (media.isError) return <ErrorNote>{errorMessage(media.error)}</ErrorNote>;
  if (presets.isError) return <ErrorNote>{errorMessage(presets.error)}</ErrorNote>;
  if (!preset) return <ErrorNote>Nessun preset</ErrorNote>;

  const library = new Map(media.data.map((m) => [m.id, m]));
  const itemById = new Map(preset.items.map((i) => [i.mediaId, i]));
  const order = dragOrder ?? preset.items.map((i) => i.mediaId);
  const list = order.flatMap((id) => (library.has(id) && itemById.has(id) ? [{ media: library.get(id)!, item: itemById.get(id)! }] : []));
  const presetFit = preset.fit ?? settings.data?.carouselFit ?? 'contain';
  const spare = media.data.filter((m) => !itemById.has(m.id));
  const usedIn = (mediaId: number) => presets.data.filter((p) => p.items.some((i) => i.mediaId === mediaId)).map((p) => p.label);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Media</h1>
          <p className="text-sm text-slate-500">
            Immagini e video che il cartello mostra a tutto schermo quando non ci sono eventi in programma. Ogni preset è un
            carosello con i suoi file, l’ordine e le impostazioni; un cartello sceglie il suo con <code>?preset=nome</code> nell’indirizzo.
            Le sale restano sempre visibili in basso.
          </p>
        </div>
        <Button variant="primary" disabled={uploading !== null} onClick={() => fileInput.current?.click()}>
          <Upload className="size-4" />
          Carica
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          accept="image/*,video/mp4,video/webm"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {presets.data.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setCreating(false);
              selectPreset(p.isDefault ? '' : p.name);
            }}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium ring-1 ${p.id === preset.id ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}
          >
            {p.label}
            {p.isDefault && <span className={`text-xs ${p.id === preset.id ? 'text-brand-100' : 'text-slate-500'}`}>Predefinito</span>}
          </button>
        ))}
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          Nuovo preset
        </Button>
      </div>

      {creating && (
        <NewPreset
          current={preset}
          onCancel={() => setCreating(false)}
          onCreated={(name) => {
            setCreating(false);
            selectPreset(name);
          }}
        />
      )}

      {settings.data && <PresetSettings preset={preset} presets={presets.data} settings={settings.data} onGone={selectPreset} />}

      {uploading && (
        <Card className="p-4">
          <div className="mb-2 flex justify-between text-sm">
            <span className="truncate font-medium text-slate-900">{uploading.name}</span>
            <span className="text-slate-500 tabular-nums">{Math.round(uploading.progress * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-brand-700 transition-[width]" style={{ width: `${uploading.progress * 100}%` }} />
          </div>
        </Card>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Nel preset «{preset.label}»</h2>
        <Card>
          {list.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">Nessun file. Carica un file o aggiungine uno dalla libreria. Senza media il cartello mostra «No events scheduled».</p>
          ) : (
            <ul ref={listRef} className="divide-y divide-slate-100">
              {list.map(({ media: file, item }, i) => (
                <li
                  key={file.id}
                  data-media-id={file.id}
                  className={`flex items-center gap-3 px-3 py-3 sm:gap-4 ${dragging === file.id ? 'relative z-10 bg-brand-50 shadow-lg ring-2 ring-brand-600' : 'bg-white'}`}
                >
                  <button
                    type="button"
                    aria-label="Trascina per riordinare (o usa le frecce su e giù)"
                    title="Trascina per riordinare"
                    onPointerDown={(e) => startDrag(e, file.id)}
                    onKeyDown={(e) => {
                      const by = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
                      if (!by || i + by < 0 || i + by >= list.length) return;
                      e.preventDefault();
                      const ids = list.map((x) => x.media.id);
                      [ids[i], ids[i + by]] = [ids[i + by]!, ids[i]!];
                      reorder(ids);
                    }}
                    className="cursor-grab touch-none rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
                  >
                    <GripVertical className="size-5" />
                  </button>
                  <Thumb item={file} dim={!item.enabled} />
                  <div className="min-w-0 flex-1">
                    <div className={`truncate font-medium ${item.enabled ? 'text-slate-900' : 'text-slate-400'}`}>{file.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <KindBadge kind={file.kind} />
                      {formatSize(file.size)}
                      {!item.enabled && <Badge tone="amber">Disattivato</Badge>}
                    </div>
                  </div>
                  <select
                    className={`${inputClass} hidden w-52! sm:block`}
                    value={item.fit ?? ''}
                    title="Adattamento allo schermo"
                    onChange={(e) => patchItem(file.id, { fit: (e.target.value || null) as MediaFit | null })}
                  >
                    <option value="">Come il preset ({fitLabel(presetFit)})</option>
                    {FITS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <Switch
                    checked={item.enabled}
                    label={item.enabled ? 'Attivo: clicca per disattivare' : 'Disattivato: clicca per attivare'}
                    onChange={(enabled) => patchItem(file.id, { enabled })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Togli dal preset"
                    title="Togli dal preset (resta nella libreria)"
                    onClick={() => setItems(preset.items.filter((x) => x.mediaId !== file.id))}
                  >
                    <X className="size-4 text-slate-600" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Libreria</h2>
        <Card>
          {spare.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Tutti i file della libreria sono in questo preset.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {spare.map((file) => (
                <li key={file.id} className="flex items-center gap-3 bg-white px-3 py-3 sm:gap-4">
                  <Thumb item={file} dim={false} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-900">{file.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <KindBadge kind={file.kind} />
                      {formatSize(file.size)}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => setItems([...preset.items, { mediaId: file.id, enabled: true, fit: null }])}>
                    <Plus className="size-4" />
                    Aggiungi
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Elimina dalla libreria"
                    title="Elimina il file dalla libreria"
                    busy={remove.isPending && remove.variables === file.id}
                    onClick={async () => {
                      const others = usedIn(file.id);
                      const warning = others.length ? ` Usato anche in: ${others.join(', ')}.` : '';
                      if (await confirm(`Eliminare «${file.name}» dalla libreria?${warning}`, { confirmLabel: 'Elimina', danger: true })) remove.mutate(file.id);
                    }}
                  >
                    <Trash2 className="size-4 text-red-600" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <p className="text-xs text-slate-500">
          Un file eliminato dalla libreria sparisce da tutti i preset. Per toglierlo solo da questo preset usa la X nell’elenco sopra.
        </p>
      </section>

      {settings.data && <CarouselSettings settings={settings.data} />}
      <p className="text-xs text-slate-500">
        Immagini fino a 30 MB, ridimensionate per uno schermo Full HD. Video MP4 (H.264) o WebM fino a 1 GB, riprodotti senza audio:
        il Raspberry Pi riproduce bene l’H.264 fino al Full HD. Di notte il carosello può lasciare il posto a un orologio
        (Impostazioni → Cartello: tema).
      </p>
    </div>
  );
}

function Thumb({ item, dim }: { item: MediaItem; dim: boolean }) {
  return (
    <div className={`h-16 w-28 shrink-0 overflow-hidden rounded-md bg-black ${dim ? 'opacity-40' : ''}`}>
      {item.kind === 'image' ? (
        <img src={`/api/media/${item.id}`} alt="" draggable={false} className="size-full object-contain" />
      ) : (
        <video src={`/api/media/${item.id}#t=1`} muted preload="metadata" className="size-full object-contain" />
      )}
    </div>
  );
}

function KindBadge({ kind }: { kind: MediaItem['kind'] }) {
  return (
    <Badge tone={kind === 'image' ? 'brand' : 'slate'}>
      {kind === 'image' ? <ImageIcon className="size-3" /> : <Film className="size-3" />}
      {kind === 'image' ? 'Immagine' : 'Video'}
    </Badge>
  );
}
