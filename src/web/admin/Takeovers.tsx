import { useMutation, useQuery } from '@tanstack/react-query';
import { ImageUp, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import type { MediaFit, Takeover } from '../../shared/model.ts';
import { computeRoomStatuses } from '../../shared/status.ts';
import { HOUR, MINUTE } from '../../shared/time.ts';
import { MAX_IMAGE_BYTES } from '../../shared/settings.ts';
import { TakeoverView } from '../sign/TakeoverView.tsx';
import { takeoverChrome } from '../sign/chrome.ts';
import { api, errorMessage, HttpError, queryClient, useDisplay } from './api.ts';
import { fromDateTimeValue, toDateTimeValue } from './dates.ts';
import { Badge, Button, Card, ErrorNote, Field, inputClass, PageLoading, useFeedback } from './ui.tsx';

const takeoversKey = ['takeovers'] as const;

interface Screen {
  id: number;
  name: string;
  label: string;
  isDefault: boolean;
}

const FITS: { value: MediaFit; label: string }[] = [
  { value: 'contain', label: 'Adatta (sfondo sfocato ai lati)' },
  { value: 'cover', label: 'Riempi (taglia i bordi)' },
  { value: 'fill', label: 'Estendi (deforma)' },
];

type Choice = 'screen' | 'show' | 'hide';
const toChoice = (v: boolean | null): Choice => (v === null ? 'screen' : v ? 'show' : 'hide');
const fromChoice = (c: Choice): boolean | null => (c === 'screen' ? null : c === 'show');

const when = (t: number) => format(t, 'EEE d MMM, HH:mm', { locale: it });

function refresh() {
  void queryClient.invalidateQueries({ queryKey: takeoversKey });
  void queryClient.invalidateQueries({ queryKey: ['display'] });
}

/** The sign exactly as it will look, scaled down: the real component, fed with the form and the live room statuses. */
function Demo({ src, fit, header, footer }: { src: string; fit: MediaFit; header: Choice; footer: Choice }) {
  const display = useDisplay();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const rooms = display.data?.rooms ?? [];
  const statuses = useMemo(
    () => computeRoomStatuses({ rooms, events: display.data?.events ?? [], overrides: display.data?.overrides ?? [], now }),
    [display.data, now],
  );

  // The sign is laid out on 96 × 54 rem; scale that box to the width available.
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const measure = () => setScale(element.clientWidth / (96 * rem));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const chrome = takeoverChrome(
    { header: fromChoice(header), footer: fromChoice(footer) } as Takeover,
    { header: true, footer: true },
  );
  return (
    <div ref={ref} className="overflow-hidden rounded-lg ring-1 ring-slate-900/10" style={{ height: `${54 * scale}rem` }}>
      <div className="origin-top-left" style={{ width: '96rem', transform: `scale(${scale})` }}>
        <TakeoverView
          src={src}
          fit={fit}
          chrome={chrome}
          now={now}
          rooms={rooms}
          statuses={statuses}
          venueLogo={display.data?.venueLogo ?? null}
          className="h-[54rem] w-[96rem]"
        />
      </div>
    </div>
  );
}

function Choices({ label, value, onChange }: { label: string; value: Choice; onChange: (c: Choice) => void }) {
  return (
    <Field label={label}>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value as Choice)}>
        <option value="screen">Come impostato sullo schermo</option>
        <option value="show">Mostra</option>
        <option value="hide">Nascondi</option>
      </select>
    </Field>
  );
}

/** Create (with a file) or edit (`existing`) a takeover. */
function TakeoverForm({ existing, onDone }: { existing: Takeover | null; onDone: () => void }) {
  const { toast } = useFeedback();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState(existing?.name ?? '');
  const [start, setStart] = useState(() => toDateTimeValue(existing?.startAt ?? Math.ceil(Date.now() / (5 * MINUTE)) * 5 * MINUTE));
  const [end, setEnd] = useState(() => toDateTimeValue(existing?.endAt ?? Math.ceil(Date.now() / (5 * MINUTE)) * 5 * MINUTE + HOUR));
  const [fit, setFit] = useState<MediaFit>(existing?.fit ?? 'contain');
  const [header, setHeader] = useState<Choice>(toChoice(existing?.header ?? null));
  const [footer, setFooter] = useState<Choice>(toChoice(existing?.footer ?? null));
  const [error, setError] = useState<string | null>(null);
  const screens = useQuery({ queryKey: ['takeover-presets'], queryFn: () => api<Screen[]>('/takeovers/presets') });
  // A new notice starts on every screen; the choice waits for the list when it hasn't loaded yet.
  const [picked, setPicked] = useState<number[] | null>(existing?.presetIds ?? null);
  const presetIds = picked ?? screens.data?.map((p) => p.id) ?? [];
  const toggle = (id: number) => setPicked(presetIds.includes(id) ? presetIds.filter((p) => p !== id) : [...presetIds, id]);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const startAt = fromDateTimeValue(start);
  const endAt = fromDateTimeValue(end);
  const timesOk = startAt !== null && endAt !== null && startAt < endAt;
  const src = existing ? `/api/takeovers/${existing.id}/image` : preview;

  const save = useMutation({
    mutationFn: async () => {
      const data = { name: name.trim(), startAt, endAt, fit, header: fromChoice(header), footer: fromChoice(footer), presetIds };
      if (existing) return api(`/takeovers/${existing.id}`, { method: 'PUT', json: data });
      const form = new FormData();
      form.set('file', file!);
      form.set('data', JSON.stringify(data));
      return api('/takeovers', { method: 'POST', form });
    },
    onSuccess: () => {
      refresh();
      toast(existing ? 'Avviso aggiornato' : 'Avviso programmato');
      onDone();
    },
    onError: (e) => setError(e instanceof HttpError && e.body?.issues?.[0]?.message ? e.body.issues[0].message : errorMessage(e)),
  });

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!f.type.startsWith('image/')) return setError('Scegli un’immagine');
    if (f.size > MAX_IMAGE_BYTES) return setError('Immagine troppo grande (max 30 MB)');
    setFile(f);
    if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, '').slice(0, 100));
  };

  const ready = !!name.trim() && timesOk && presetIds.length > 0 && (existing !== null || file !== null);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">{existing ? 'Modifica avviso' : 'Nuovo avviso'}</h2>
        <button type="button" onClick={onDone} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Chiudi">
          <X className="size-5" />
        </button>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {!existing && (
            <Field label="Immagine" hint="Viene ridimensionata a Full HD. Si cancella dal server alla fine dell’orario.">
              <input type="file" accept="image/*" className={inputClass} onChange={(e) => pick(e.target.files?.[0])} />
            </Field>
          )}
          <Field label="Nome">
            <input className={inputClass} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dal">
              <input type="datetime-local" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Al" error={start && end && !timesOk ? 'La fine deve venire dopo l’inizio' : undefined}>
              <input type="datetime-local" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
          <Field label="Schermi" hint="I preset dei media: ogni schermo usa il suo (?preset=…) o quello predefinito." error={screens.data && presetIds.length === 0 ? 'Scegli almeno uno schermo' : undefined}>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {screens.data?.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm text-slate-800">
                  <input type="checkbox" checked={presetIds.includes(p.id)} onChange={() => toggle(p.id)} className="size-4 rounded border-slate-300 text-brand-600" />
                  {p.label}
                  {p.isDefault && <Badge>predefinito</Badge>}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Adattamento">
            <select className={inputClass} value={fit} onChange={(e) => setFit(e.target.value as MediaFit)}>
              {FITS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Choices label="Intestazione (logo e orologio)" value={header} onChange={setHeader} />
            <Choices label="Barra delle sale" value={footer} onChange={setFooter} />
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-sm font-medium text-slate-700">Anteprima dal vivo</div>
          {src ? (
            <Demo src={src} fit={fit} header={header} footer={footer} />
          ) : (
            <div className="grid aspect-video place-items-center rounded-lg bg-slate-100 text-sm text-slate-400">Scegli un’immagine</div>
          )}
          <p className="mt-1.5 text-sm text-slate-500">
            «Come impostato sullo schermo» segue l’indirizzo dello schermo (<code>?header=0</code>, <code>?footer=0</code>); qui è mostrato con entrambi.
          </p>
        </div>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onDone}>Annulla</Button>
        <Button variant="primary" disabled={!ready} busy={save.isPending} onClick={() => save.mutate()}>
          <ImageUp className="size-4" />
          {existing ? 'Salva' : 'Programma'}
        </Button>
      </div>
    </Card>
  );
}

function describeChrome(t: Takeover): string {
  const part = (label: string, v: boolean | null) => `${label}: ${v === null ? 'come lo schermo' : v ? 'sì' : 'no'}`;
  return `${part('intestazione', t.header)} · ${part('sale', t.footer)}`;
}

export default function Takeovers() {
  const screens = useQuery({ queryKey: ['takeover-presets'], queryFn: () => api<Screen[]>('/takeovers/presets') });
  const screenNames = (t: Takeover) =>
    t.presetIds.length === screens.data?.length ? 'tutti gli schermi' : (screens.data ?? []).filter((p) => t.presetIds.includes(p.id)).map((p) => p.label).join(', ') || '—';
  const { confirm, toast } = useFeedback();
  const [editing, setEditing] = useState<Takeover | 'new' | null>(null);
  const list = useQuery({ queryKey: takeoversKey, queryFn: () => api<Takeover[]>('/takeovers'), refetchInterval: 30_000 });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/takeovers/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      toast('Avviso eliminato');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (list.isPending) return <PageLoading />;
  const now = Date.now();

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Avvisi a schermo intero</h1>
          <p className="text-sm text-slate-500">Un’immagine che prende il posto del cartellone tra due orari, poi sparisce anche dal server.</p>
        </div>
        {editing === null && (
          <Button variant="primary" onClick={() => setEditing('new')}>
            <ImageUp className="size-4" />
            Nuovo avviso
          </Button>
        )}
      </div>

      {editing !== null && (
        <TakeoverForm key={editing === 'new' ? 'new' : editing.id} existing={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
      )}

      {list.error && <ErrorNote>{errorMessage(list.error)}</ErrorNote>}
      {list.data?.length === 0 && editing === null && <Card className="p-8 text-center text-sm text-slate-500">Nessun avviso in programma.</Card>}
      <div className="space-y-3">
        {list.data?.map((t) => (
          <Card key={t.id} className="flex items-center gap-4 p-3">
            <img src={`/api/takeovers/${t.id}/image`} alt="" className="h-20 w-36 shrink-0 rounded-md bg-slate-100 object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-slate-900">{t.name}</span>
                {t.startAt <= now ? <Badge tone="brand">In onda</Badge> : <Badge>Programmato</Badge>}
              </div>
              <div className="text-sm text-slate-600">
                {when(t.startAt)} → {when(t.endAt)}
              </div>
              <div className="text-xs text-slate-500">Schermi: {screenNames(t)} · {describeChrome(t)}</div>
            </div>
            <Button size="sm" onClick={() => setEditing(t)}>
              <Pencil className="size-4" />
              Modifica
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={async () => (await confirm(`Eliminare «${t.name}»? L’immagine viene cancellata dal server.`, { confirmLabel: 'Elimina', danger: true })) && remove.mutate(t.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
