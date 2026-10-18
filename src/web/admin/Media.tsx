import { useMutation, useQuery } from '@tanstack/react-query';
import { ExternalLink, Film, GripVertical, Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { MediaFit, MediaItem, Settings } from '../../shared/model.ts';
import { api, errorMessage, HttpError, keys, queryClient, useSettings } from './api.ts';
import { NumberWithSlider } from './Settings.tsx';
import { Badge, Button, buttonClass, Card, ErrorNote, Field, inputClass, PageLoading, useFeedback } from './ui.tsx';

const mediaKey = ['media'] as const;

const FITS: { value: MediaFit; label: string; description: string }[] = [
  { value: 'contain', label: 'Adatta', description: 'Tutto visibile, ai lati lo sfondo sfocato' },
  { value: 'fill', label: 'Estendi', description: 'Riempie lo spazio, deformando se serve' },
  { value: 'cover', label: 'Riempi', description: 'Riempie lo spazio tagliando i bordi' },
];
const fitLabel = (fit: MediaFit) => FITS.find((f) => f.value === fit)!.label;

function refresh() {
  void queryClient.invalidateQueries({ queryKey: mediaKey });
  void queryClient.invalidateQueries({ queryKey: keys.display });
}

/** Uploads with XMLHttpRequest, which (unlike fetch) reports upload progress: videos can be big. */
function uploadFile(file: File, onProgress: (fraction: number) => void): Promise<MediaItem> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api/media');
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    request.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
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
      <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Carosello</h2>
      <Field label="Durata di ogni immagine" hint="I video restano finché non finiscono.">
        <NumberWithSlider value={seconds} onChange={setSeconds} min={2} max={60} step={1} unit="secondi" />
      </Field>
      <Field label="Adattamento allo schermo" hint="Vale per i file impostati su «Predefinito».">
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

/** Carousel images and videos, shown by the sign when no event is planned (superadmin and media). */
export default function Media() {
  const { confirm, toast } = useFeedback();
  const media = useQuery({ queryKey: mediaKey, queryFn: () => api<MediaItem[]>('/media') });
  const settings = useSettings();
  const fileInput = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);
  /** Order shown while dragging, before it's saved. */
  const [dragOrder, setDragOrder] = useState<number[] | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const reorder = useMutation({
    mutationFn: (ids: number[]) => api<MediaItem[]>('/media/order', { method: 'PUT', json: { ids } }),
    onSettled: refresh,
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const patch = useMutation({
    mutationFn: ({ id, ...body }: { id: number; enabled?: boolean; fit?: MediaFit | null }) =>
      api<MediaItem>(`/media/${id}`, { method: 'PATCH', json: body }),
    onSuccess: refresh,
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

  async function upload(files: FileList) {
    for (const file of [...files]) {
      setUploading({ name: file.name, progress: 0 });
      try {
        await uploadFile(file, (progress) => setUploading({ name: file.name, progress }));
        toast(`${file.name} caricato`);
      } catch (error) {
        toast(`${file.name}: ${errorMessage(error)}`, 'error');
      }
    }
    setUploading(null);
    refresh();
  }

  function saveOrder(ids: number[]) {
    const byId = new Map((media.data ?? []).map((m) => [m.id, m]));
    queryClient.setQueryData<MediaItem[]>(mediaKey, ids.flatMap((id) => byId.get(id) ?? []));
    reorder.mutate(ids);
  }

  /** Drag by the handle with mouse, pen or finger: rows move as the pointer passes their middle. */
  function startDrag(e: ReactPointerEvent, id: number) {
    e.preventDefault();
    const initial = (media.data ?? []).map((m) => m.id);
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
      if (current.join() !== initial.join()) saveOrder(current);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  if (media.isPending || settings.isPending) return <PageLoading />;
  if (media.isError) return <ErrorNote>{errorMessage(media.error)}</ErrorNote>;

  const byId = new Map(media.data.map((m) => [m.id, m]));
  const list = dragOrder ? dragOrder.flatMap((id) => byId.get(id) ?? []) : media.data;
  const globalFit = settings.data?.carouselFit ?? 'contain';

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Media</h1>
          <p className="text-sm text-slate-500">
            Immagini e video che il cartello mostra a tutto schermo quando non ci sono eventi in programma. Le sale restano
            sempre visibili in basso. Trascina dalla maniglia per cambiare l’ordine.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <a href="/carousel" target="_blank" rel="noreferrer" className={buttonClass()} title="Il cartello con il solo carosello, anche se ci sono eventi">
            <ExternalLink className="size-4" />
            Anteprima
          </a>
          <Button variant="primary" disabled={uploading !== null} onClick={() => fileInput.current?.click()}>
            <Upload className="size-4" />
            Carica
          </Button>
        </div>
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

      <Card>
        {list.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">Nessun file. Senza media il cartello mostra «No events scheduled».</p>
        ) : (
          <ul ref={listRef} className="divide-y divide-slate-100">
            {list.map((item, i) => (
              <li
                key={item.id}
                data-media-id={item.id}
                className={`flex items-center gap-3 px-3 py-3 sm:gap-4 ${dragging === item.id ? 'relative z-10 bg-brand-50 shadow-lg ring-2 ring-brand-600' : 'bg-white'}`}
              >
                <button
                  type="button"
                  aria-label="Trascina per riordinare (o usa le frecce su e giù)"
                  title="Trascina per riordinare"
                  onPointerDown={(e) => startDrag(e, item.id)}
                  onKeyDown={(e) => {
                    const by = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
                    if (!by || i + by < 0 || i + by >= list.length) return;
                    e.preventDefault();
                    const ids = list.map((m) => m.id);
                    [ids[i], ids[i + by]] = [ids[i + by]!, ids[i]!];
                    saveOrder(ids);
                  }}
                  className="cursor-grab touch-none rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
                >
                  <GripVertical className="size-5" />
                </button>
                <div className={`h-16 w-28 shrink-0 overflow-hidden rounded-md bg-black ${item.enabled ? '' : 'opacity-40'}`}>
                  {item.kind === 'image' ? (
                    <img src={`/api/media/${item.id}`} alt="" draggable={false} className="size-full object-contain" />
                  ) : (
                    <video src={`/api/media/${item.id}#t=1`} muted preload="metadata" className="size-full object-contain" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`truncate font-medium ${item.enabled ? 'text-slate-900' : 'text-slate-400'}`}>{item.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Badge tone={item.kind === 'image' ? 'brand' : 'slate'}>
                      {item.kind === 'image' ? <ImageIcon className="size-3" /> : <Film className="size-3" />}
                      {item.kind === 'image' ? 'Immagine' : 'Video'}
                    </Badge>
                    {formatSize(item.size)}
                    {!item.enabled && <Badge tone="amber">Disattivato</Badge>}
                  </div>
                </div>
                <select
                  className={`${inputClass} hidden w-52! sm:block`}
                  value={item.fit ?? ''}
                  title="Adattamento allo schermo"
                  onChange={(e) => patch.mutate({ id: item.id, fit: (e.target.value || null) as MediaFit | null })}
                >
                  <option value="">Predefinito ({fitLabel(globalFit)})</option>
                  {FITS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <Switch
                  checked={item.enabled}
                  label={item.enabled ? 'Attivo: clicca per disattivare' : 'Disattivato: clicca per attivare'}
                  onChange={(enabled) => patch.mutate({ id: item.id, enabled })}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Elimina"
                  busy={remove.isPending && remove.variables === item.id}
                  onClick={async () => {
                    if (await confirm(`Eliminare «${item.name}»?`, { confirmLabel: 'Elimina', danger: true })) remove.mutate(item.id);
                  }}
                >
                  <Trash2 className="size-4 text-red-600" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {settings.data && <CarouselSettings settings={settings.data} />}
      <p className="text-xs text-slate-500">
        Immagini fino a 30 MB, ridimensionate per uno schermo Full HD. Video MP4 (H.264) o WebM fino a 500 MB, riprodotti senza audio:
        il Raspberry Pi riproduce bene l’H.264 fino al Full HD. Di notte il carosello può lasciare il posto a un orologio
        (Impostazioni → Cartello: tema).
      </p>
    </div>
  );
}
