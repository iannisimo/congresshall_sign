import { useMutation } from '@tanstack/react-query';
import { addDays } from 'date-fns';
import { AlertTriangle, ArrowLeft, Eye, EyeOff, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { findConflicts } from '../../shared/conflicts.ts';
import { BREAK_PRESETS, type Conflict, type Organizer, type Room, type ScheduledEvent } from '../../shared/model.ts';
import { eventInputSchema, type EventInput } from '../../shared/schemas.ts';
import { changeoverMargins, type ChangeoverSettings as Changeover, DAY, DEFAULT_DURATION_MINUTES, MINUTE } from '../../shared/time.ts';
import { formatAdminShortDay, formatAdminTime } from '../lib/format.ts';
import { DEFAULT_SETTINGS } from '../../shared/settings.ts';
import { api, errorMessage, HttpError, refreshSchedule, useEvent, useEvents, useOrganizers, useRooms, useSettings } from './api.ts';
import { atTime, dateShortcut, fromDateTimeValue, fromDateValue, toDateTimeValue, toDateValue, todayValue, toTimeValue } from './dates.ts';
import { LogoPicker, OrganizerPicker } from './OrganizerFields.tsx';
import { SignCardPreview } from './SignPreview.tsx';
import { Button, buttonClass, Card, ErrorNote, Field, inputClass, PageLoading, useFeedback } from './ui.tsx';

type Mode = 'new' | 'edit' | 'clone';

interface Draft {
  organizerId: number | null;
  logoId: number | null;
  title: string;
  subtitle: string;
  roomIds: number[];
  /** One event per date: several only when creating (ADMIN-8). */
  dates: string[];
  start: string;
  end: string;
  margins: MarginMode;
  /** Used with custom margins. */
  prepMinutes: number;
  cleanupMinutes: number;
  /** Pauses as times of day, repeated on every date. */
  breaks: DraftBreak[];
  visible: boolean;
}

interface DraftBreak {
  label: string;
  start: string;
  end: string;
}

/**
 * How long the room is held around the event: the two usual congress set-ups (from/until 14:00 around
 * the event, or nothing), or custom times.
 */
type MarginMode = 'changeover' | 'none' | 'custom';

function margins(draft: Draft, startAt: number, endAt: number, changeover: Changeover): { prepAt: number; releaseAt: number } {
  switch (draft.margins) {
    case 'changeover':
      return changeoverMargins(startAt, endAt, changeover);
    case 'none':
      return { prepAt: startAt, releaseAt: endAt };
    case 'custom':
      return { prepAt: startAt - draft.prepMinutes * MINUTE, releaseAt: endAt + draft.cleanupMinutes * MINUTE };
  }
}

type FieldKey = 'organizer' | 'title' | 'subtitle' | 'rooms' | 'dates' | 'times' | 'prep' | 'cleanup' | 'breaks';

const FIELD_OF: Record<string, FieldKey> = {
  organizerId: 'organizer',
  title: 'title',
  subtitle: 'subtitle',
  roomIds: 'rooms',
  startAt: 'times',
  endAt: 'times',
  prepAt: 'prep',
  releaseAt: 'cleanup',
  breaks: 'breaks',
};

function shiftTime(time: string, minutes: number): string {
  const t = atTime(todayValue(), time);
  return t === null ? time : toTimeValue(t + minutes * MINUTE);
}

function newDraft(search: URLSearchParams): Draft {
  const date = search.get('d') ?? todayValue();
  const startParam = search.get('start');
  const nextHour = Math.ceil(Date.now() / (60 * MINUTE)) * 60 * MINUTE;
  const start = startParam && /^\d{2}:\d{2}$/.test(startParam) ? startParam : date === todayValue() ? toTimeValue(nextHour) : '09:00';
  const room = Number(search.get('room'));
  return {
    organizerId: null,
    logoId: null,
    title: '',
    subtitle: '',
    roomIds: room > 0 ? [room] : [],
    dates: [date],
    start,
    end: shiftTime(start, DEFAULT_DURATION_MINUTES),
    margins: 'changeover',
    prepMinutes: 30,
    cleanupMinutes: 30,
    breaks: [],
    visible: true,
  };
}

function draftFrom(event: ScheduledEvent, changeover: Changeover): Draft {
  const defaults = changeoverMargins(event.startAt, event.endAt, changeover);
  const mode: MarginMode =
    event.prepAt === defaults.prepAt && event.releaseAt === defaults.releaseAt
      ? 'changeover'
      : event.prepAt === event.startAt && event.releaseAt === event.endAt
        ? 'none'
        : 'custom';
  return {
    organizerId: event.organizerId,
    logoId: event.logoId,
    title: event.title,
    subtitle: event.subtitle ?? '',
    roomIds: event.roomIds,
    dates: [toDateValue(event.startAt)],
    start: toTimeValue(event.startAt),
    end: toTimeValue(event.endAt),
    margins: mode,
    prepMinutes: Math.round((event.startAt - event.prepAt) / MINUTE),
    cleanupMinutes: Math.round((event.releaseAt - event.endAt) / MINUTE),
    breaks: event.breaks.map((b) => ({ label: b.label, start: toTimeValue(b.startAt), end: toTimeValue(b.endAt) })),
    visible: event.visible,
  };
}

/** API inputs for each date, or null where the date or times can't be read. Ends before the start mean the next day. */
function buildInputs(draft: Draft, changeover: Changeover): (EventInput | null)[] {
  return draft.dates.map((date) => {
    const startAt = atTime(date, draft.start);
    let endAt = atTime(date, draft.end);
    if (startAt === null || endAt === null) return null;
    if (endAt <= startAt) endAt += DAY;
    const { prepAt, releaseAt } = margins(draft, startAt, endAt, changeover);
    // Break times are on the event's day; in events past midnight, earlier times are the next day.
    const breaks = [];
    for (const b of draft.breaks) {
      let breakStart = atTime(date, b.start);
      let breakEnd = atTime(date, b.end);
      if (breakStart === null || breakEnd === null) return null;
      if (breakStart < startAt) breakStart += DAY;
      if (breakEnd <= breakStart) breakEnd += DAY;
      breaks.push({ label: b.label, startAt: breakStart, endAt: breakEnd });
    }
    return {
      organizerId: draft.organizerId ?? 0,
      logoId: draft.logoId,
      title: draft.title,
      subtitle: draft.subtitle,
      roomIds: draft.roomIds,
      prepAt,
      startAt,
      endAt,
      releaseAt,
      breaks,
      visible: draft.visible,
    };
  });
}

function validate(draft: Draft, inputs: (EventInput | null)[]) {
  const errors: Partial<Record<FieldKey, string>> = {};
  const valid: EventInput[] = [];
  if (draft.organizerId === null) errors.organizer = 'Scegli o crea un organizzatore';
  if (inputs.some((i) => i === null)) errors.dates = 'Controlla date e orari';
  if (new Set(draft.dates).size !== draft.dates.length) errors.dates = 'Giorno ripetuto';
  for (const input of inputs) {
    if (!input) continue;
    const result = eventInputSchema.safeParse(input);
    if (result.success) {
      valid.push(result.data);
      continue;
    }
    for (const issue of result.error.issues) {
      const key = FIELD_OF[String(issue.path[0])];
      if (key && !errors[key]) errors[key] = key === 'organizer' ? 'Scegli o crea un organizzatore' : issue.message;
    }
  }
  return { errors, inputs: Object.keys(errors).length === 0 ? valid : null };
}

function minutesLabel(m: number): string {
  if (m === 0) return 'Nessuna';
  if (m % 60 === 0) return m === 60 ? '1 ora' : `${m / 60} ore`;
  return `${m} min`;
}

const BREAK_MINUTES: Record<string, number> = { Break: 15, 'Coffee break': 30, 'Lunch break': 60 };

/** A sensible slot for a new break: lunch at 13:00 when it fits, otherwise after the last break. */
function suggestBreak(label: string, breaks: DraftBreak[], eventStart: string, eventEnd: string): DraftBreak {
  const toMinutes = (time: string) => {
    const [h = 0, m = 0] = time.split(':').map(Number);
    return h * 60 + m;
  };
  const toTime = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  const start = toMinutes(eventStart);
  let end = toMinutes(eventEnd);
  if (end <= start) end += 24 * 60;
  const length = BREAK_MINUTES[label] ?? 30;
  let from: number;
  if (label === 'Lunch break' && start <= 13 * 60 && 14 * 60 <= end) from = 13 * 60;
  else {
    const after = breaks.length > 0 ? toMinutes(breaks[breaks.length - 1]!.end) + 90 : start + 90;
    from = Math.ceil(after / 15) * 15;
  }
  // Keep it inside the event.
  from = Math.max(start, Math.min(from, end - length));
  return { label, start: toTime(from), end: toTime(from + length) };
}

function BreaksEditor({
  breaks,
  onChange,
  eventStart,
  eventEnd,
}: {
  breaks: DraftBreak[];
  onChange: (breaks: DraftBreak[]) => void;
  eventStart: string;
  eventEnd: string;
}) {
  const set = (i: number, patch: Partial<DraftBreak>) => onChange(breaks.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const add = (label: string) =>
    onChange([...breaks, suggestBreak(label, breaks, eventStart, eventEnd)].sort((a, b) => a.start.localeCompare(b.start)));
  return (
    <div className="space-y-2">
      {breaks.map((b, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input
            className={`${inputClass} w-44!`}
            value={b.label}
            maxLength={40}
            placeholder="Nome della pausa"
            list="break-presets"
            onChange={(e) => set(i, { label: e.target.value })}
          />
          <input type="time" className={`${inputClass} w-auto!`} value={b.start} onChange={(e) => set(i, { start: e.target.value })} />
          <span className="text-slate-400">–</span>
          <input type="time" className={`${inputClass} w-auto!`} value={b.end} onChange={(e) => set(i, { end: e.target.value })} />
          <button
            type="button"
            onClick={() => onChange(breaks.filter((_, j) => j !== i))}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Togli pausa"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
      <datalist id="break-presets">
        {BREAK_PRESETS.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
      <div className="flex flex-wrap gap-1.5">
        {[...BREAK_PRESETS, ''].map((label) => (
          <button
            key={label || 'custom'}
            type="button"
            onClick={() => add(label)}
            className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-sm text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            <Plus className="size-3.5" />
            {label || 'Altro…'}
          </button>
        ))}
      </div>
    </div>
  );
}

function MarginOption({
  selected,
  onSelect,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-lg px-4 py-3 text-left ring-1 transition-colors ${selected ? 'bg-brand-50 ring-2 ring-brand-600' : 'bg-white ring-slate-300 hover:bg-slate-50'}`}
    >
      <span className="block text-sm font-semibold text-slate-900">{title}</span>
      <span className="mt-0.5 block text-xs text-slate-600">{description}</span>
    </button>
  );
}

/** Preparation before the start or clean-up after the end: presets, or an exact time (e.g. the evening before). */
function MarginField({
  label,
  minutes,
  onChange,
  anchor,
  direction,
  describe,
  error,
}: {
  label: string;
  minutes: number;
  onChange: (minutes: number) => void;
  anchor: number | null;
  direction: 'before' | 'after';
  describe: (t: number) => string;
  error: string | undefined;
}) {
  const presets = [0, 15, 30, 60, 120];
  const exact = anchor === null ? null : anchor + (direction === 'before' ? -1 : 1) * minutes * MINUTE;
  return (
    <Field label={label} error={error} hint={exact !== null ? describe(exact) : undefined}>
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`rounded-full px-3 py-1 text-sm ring-1 ${m === minutes ? 'bg-brand-900 text-white ring-brand-900' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}
          >
            {minutesLabel(m)}
          </button>
        ))}
        <input
          type="datetime-local"
          className={`${inputClass} w-auto! py-1!`}
          disabled={exact === null}
          value={exact === null ? '' : toDateTimeValue(exact)}
          onChange={(e) => {
            const t = fromDateTimeValue(e.target.value);
            if (t === null || anchor === null) return;
            const m = Math.round((direction === 'before' ? anchor - t : t - anchor) / MINUTE);
            if (m >= 0) onChange(m);
          }}
          title="Orario esatto"
        />
      </div>
    </Field>
  );
}

/** The event as it will look on the sign (ADMIN-4), scaled to the available width. */
function Preview({ event, roomNames }: { event: ScheduledEvent; roomNames: string[] }) {
  const [live, setLive] = useState(false);
  const settings = useSettings().data ?? DEFAULT_SETTINGS;
  const now = live ? (event.startAt + event.endAt) / 2 : event.startAt - DAY;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Anteprima sul cartello</span>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          {[false, true].map((value) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setLive(value)}
              className={`rounded-md px-2.5 py-1 ${live === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              {value ? 'Durante' : 'Prima'}
            </button>
          ))}
        </div>
      </div>
      <SignCardPreview event={event} roomNames={roomNames} now={now} settings={settings} />
    </div>
  );
}

function ConflictList({ conflicts, rooms }: { conflicts: (Conflict & { date: string })[]; rooms: Map<number, Room> }) {
  return (
    <ul className="mt-1 space-y-1">
      {conflicts.map((c) => (
        <li key={`${c.date}-${c.event.id}`}>
          <span className="font-medium">{c.roomIds.map((id) => rooms.get(id)?.name).join(', ')}</span>: «{c.event.title}»{' '}
          {formatAdminShortDay(c.event.startAt)} {formatAdminTime(c.event.startAt)}–{formatAdminTime(c.event.endAt)}
          {!c.event.visible && ' (nascosto)'}
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold tracking-wide text-slate-500 uppercase">{title}</h2>
      <div className="space-y-5">{children}</div>
    </Card>
  );
}

function EditorForm({
  mode,
  initial,
  eventId,
  rooms,
  organizers,
  changeover,
  backTo,
}: {
  mode: Mode;
  initial: Draft;
  eventId: number | undefined;
  rooms: Room[];
  organizers: Organizer[];
  /** From the settings: when the default preparation starts and clean-up ends. */
  changeover: Changeover;
  backTo: string;
}) {
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const [draft, setDraft] = useState(initial);
  const [showErrors, setShowErrors] = useState(false);
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const roomMap = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const bookable = rooms.filter((r) => r.kind === 'main');
  const organizer = organizers.find((o) => o.id === draft.organizerId);

  const { prepTime, cleanupTime, cleanupMinGapHours } = changeover;
  const built = buildInputs(draft, changeover);
  const { errors, inputs } = validate(draft, built);
  const first = built[0] ?? null;
  const overnight = draft.start !== '' && draft.end !== '' && draft.end <= draft.start;

  // Conflicts with saved events, checked while editing (ADMIN-7).
  const range = inputs && {
    from: Math.min(...inputs.map((i) => i.prepAt)),
    to: Math.max(...inputs.map((i) => i.releaseAt)),
  };
  const others = useEvents(range?.from ?? 0, range?.to ?? 1, { enabled: range !== null, keepPrevious: true });
  const conflicts =
    inputs && others.data
      ? inputs.flatMap((input, i) =>
          findConflicts({ id: eventId, ...input }, others.data).map((c) => ({ ...c, date: draft.dates[i] ?? '' })),
        )
      : [];

  const save = useMutation({
    mutationFn: (allowConflicts: boolean) =>
      mode === 'edit'
        ? api(`/events/${eventId}`, { method: 'PUT', json: { event: inputs![0], allowConflicts } })
        : api('/events', { method: 'POST', json: { events: inputs, allowConflicts } }),
    onSuccess: () => {
      refreshSchedule();
      toast(inputs && inputs.length > 1 ? `${inputs.length} eventi creati` : 'Evento salvato');
      navigate(`/admin?d=${draft.dates[0]}`);
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/events/${eventId}`, { method: 'DELETE' }),
    onSuccess: () => {
      refreshSchedule();
      toast('Evento eliminato');
      navigate(`/admin?d=${backTo}`);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  async function submit() {
    setShowErrors(true);
    if (!inputs) return;
    if (
      conflicts.length > 0 &&
      !(await confirm(
        <>
          <p>Le sale sono già occupate da altri eventi:</p>
          <ConflictList conflicts={conflicts} rooms={roomMap} />
          <p className="mt-3">Salvare comunque?</p>
        </>,
        { confirmLabel: 'Salva comunque' },
      ))
    ) {
      return;
    }
    try {
      await save.mutateAsync(conflicts.length > 0);
    } catch (error) {
      // Someone else booked the room in the meantime.
      if (error instanceof HttpError && error.status === 409 && error.body?.conflicts) {
        if (await confirm('Nel frattempo è stato salvato un evento che si sovrappone. Salvare comunque?', { confirmLabel: 'Salva comunque' })) {
          await save.mutateAsync(true).catch(() => {});
        }
      }
    }
  }

  const shown = (key: FieldKey) => (showErrors ? errors[key] : undefined);
  const previewEvent: ScheduledEvent = {
    id: eventId ?? 0,
    organizerId: draft.organizerId ?? 0,
    organizerName: organizer?.name ?? 'Organizzatore',
    logoId: draft.logoId,
    title: draft.title.trim() || 'Titolo dell’evento',
    subtitle: draft.subtitle.trim() || null,
    roomIds: draft.roomIds,
    prepAt: first?.prepAt ?? Date.now(),
    startAt: first?.startAt ?? Date.now(),
    endAt: first?.endAt ?? Date.now() + DAY / 24,
    releaseAt: first?.releaseAt ?? Date.now() + DAY / 24,
    breaks: first?.breaks.map((b) => ({ ...b, label: b.label.trim() || 'Break' })) ?? [],
    visible: draft.visible,
  };
  const titles: Record<Mode, string> = { new: 'Nuovo evento', edit: 'Modifica evento', clone: 'Duplica evento' };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/admin?d=${backTo}`} className={buttonClass('ghost', 'sm')}>
          <ArrowLeft className="size-4" />
          Programma
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">{titles[mode]}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        <div className="space-y-6">
          <Section title="Organizzatore">
            <Field label="Nome" error={shown('organizer')}>
              <OrganizerPicker
                organizers={organizers}
                value={draft.organizerId}
                onChange={(id) =>
                  update({
                    organizerId: id,
                    // A newly chosen organizer starts with its first logo, if it has any.
                    logoId: id === draft.organizerId ? draft.logoId : (organizers.find((o) => o.id === id)?.logoIds[0] ?? null),
                  })
                }
              />
            </Field>
            {organizer && (
              <Field label="Logo">
                <LogoPicker organizer={organizer} value={draft.logoId} onChange={(logoId) => update({ logoId })} />
              </Field>
            )}
          </Section>

          <Section title="Evento">
            <Field label="Titolo" error={shown('title')}>
              <input className={inputClass} value={draft.title} maxLength={200} onChange={(e) => update({ title: e.target.value })} />
            </Field>
            <Field label="Sottotitolo" error={shown('subtitle')} hint="Facoltativo">
              <input className={inputClass} value={draft.subtitle} maxLength={300} onChange={(e) => update({ subtitle: e.target.value })} />
            </Field>
            <Field label="Sale" error={shown('rooms')}>
              <div className="flex flex-wrap gap-2">
                {bookable.map((room) => {
                  const on = draft.roomIds.includes(room.id);
                  return (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => {
                        const ids = new Set(draft.roomIds);
                        if (on) ids.delete(room.id);
                        else ids.add(room.id);
                        // Keep the rooms in display order.
                        update({ roomIds: bookable.filter((r) => ids.has(r.id)).map((r) => r.id) });
                      }}
                      className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 ${on ? 'bg-brand-900 text-white ring-brand-900' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}
                    >
                      {room.name}
                    </button>
                  );
                })}
                {bookable.length === 0 && <span className="text-sm text-slate-500">Nessuna sala configurata.</span>}
              </div>
            </Field>
          </Section>

          <Section title="Quando">
            <Field
              label={mode === 'edit' ? 'Giorno' : 'Giorni'}
              error={shown('dates')}
              hint={
                mode === 'edit'
                  ? 'Tasti rapidi: o = oggi, d = domani'
                  : 'Per un congresso di più giorni aggiungi i giorni: viene creato un evento per giorno, con gli stessi orari. Tasti rapidi: o = oggi, d = domani'
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                {draft.dates.map((date, i) => (
                  <div key={i} className="flex items-center">
                    <input
                      type="date"
                      className={`${inputClass} w-auto!`}
                      value={date}
                      onChange={(e) => update({ dates: draft.dates.map((d, j) => (j === i ? e.target.value : d)) })}
                      onKeyDown={(e) => {
                        const value = dateShortcut(e);
                        if (value) update({ dates: draft.dates.map((d, j) => (j === i ? value : d)) });
                      }}
                    />
                    {draft.dates.length > 1 && (
                      <button
                        type="button"
                        onClick={() => update({ dates: draft.dates.filter((_, j) => j !== i) })}
                        className="ml-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        aria-label="Togli giorno"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                ))}
                {mode !== 'edit' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const last = fromDateValue(draft.dates[draft.dates.length - 1] ?? '') ?? Date.now();
                      update({ dates: [...draft.dates, toDateValue(addDays(last, 1).getTime())] });
                    }}
                  >
                    <Plus className="size-4" />
                    Aggiungi un giorno
                  </Button>
                )}
              </div>
            </Field>

            <Field label="Orario" error={shown('times')} hint={overnight ? 'Termina il giorno dopo' : undefined}>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  className={`${inputClass} w-auto!`}
                  value={draft.start}
                  onChange={(e) => {
                    // Moving the start keeps the duration.
                    const oldStart = atTime(todayValue(), draft.start);
                    const oldEnd = atTime(todayValue(), draft.end);
                    const duration = oldStart !== null && oldEnd !== null ? (oldEnd - oldStart + DAY) % DAY : DEFAULT_DURATION_MINUTES * MINUTE;
                    update({ start: e.target.value, end: shiftTime(e.target.value, duration / MINUTE) });
                  }}
                />
                <span className="text-slate-400">–</span>
                <input type="time" className={`${inputClass} w-auto!`} value={draft.end} onChange={(e) => update({ end: e.target.value })} />
              </div>
            </Field>

            <Field
              label="Pause"
              error={shown('breaks')}
              hint="Durante l’evento il cartello mostra la prossima pausa. I nomi appaiono sul cartello: meglio in inglese."
            >
              <BreaksEditor breaks={draft.breaks} onChange={(breaks) => update({ breaks })} eventStart={draft.start} eventEnd={draft.end} />
            </Field>

            <Field
              label="Preparazione e riordino della sala"
              error={draft.margins === 'custom' ? undefined : (shown('prep') ?? shown('cleanup'))}
              hint={
                first && draft.margins !== 'custom'
                  ? `${draft.dates.length > 1 ? 'Primo giorno: sala riservata' : 'Sala riservata'} dalle ${formatAdminTime(first.prepAt)} di ${formatAdminShortDay(first.prepAt)} alle ${formatAdminTime(first.releaseAt)} di ${formatAdminShortDay(first.releaseAt)}`
                  : undefined
              }
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <MarginOption
                  selected={draft.margins === 'changeover'}
                  onSelect={() => update({ margins: 'changeover' })}
                  title={`Dalle ${prepTime} del giorno prima`}
                  description={`Fino alle ${cleanupTime} dopo la fine (lo stesso giorno se finisce almeno ${cleanupMinGapHours} ${cleanupMinGapHours === 1 ? 'ora' : 'ore'} prima). Tra i giorni di un congresso la sala resta riservata.`}
                />
                <MarginOption
                  selected={draft.margins === 'none'}
                  onSelect={() => update({ margins: 'none' })}
                  title="Nessuna preparazione né riordino"
                  description="La sala è riservata solo durante l’evento."
                />
              </div>
              {draft.margins !== 'custom' && (
                <button
                  type="button"
                  className="mt-2 text-sm font-medium text-brand-800 hover:underline"
                  onClick={() =>
                    // Start from what is shown now, so the times only change when edited.
                    update({
                      margins: 'custom',
                      ...(first && {
                        prepMinutes: Math.round((first.startAt - first.prepAt) / MINUTE),
                        cleanupMinutes: Math.round((first.releaseAt - first.endAt) / MINUTE),
                      }),
                    })
                  }
                >
                  Orari personalizzati…
                </button>
              )}
            </Field>
            {draft.margins === 'custom' && (
              <>
                <MarginField
                  label="Preparazione della sala"
                  minutes={draft.prepMinutes}
                  onChange={(prepMinutes) => update({ prepMinutes })}
                  anchor={first?.startAt ?? null}
                  direction="before"
                  describe={(t) => `Sala riservata dalle ${formatAdminTime(t)} (${formatAdminShortDay(t)})`}
                  error={shown('prep')}
                />
                <MarginField
                  label="Riordino dopo l’evento"
                  minutes={draft.cleanupMinutes}
                  onChange={(cleanupMinutes) => update({ cleanupMinutes })}
                  anchor={first?.endAt ?? null}
                  direction="after"
                  describe={(t) => `La sala torna libera alle ${formatAdminTime(t)} (${formatAdminShortDay(t)})`}
                  error={shown('cleanup')}
                />
                <button type="button" className="text-sm font-medium text-brand-800 hover:underline" onClick={() => update({ margins: 'changeover' })}>
                  Torna alle impostazioni consuete
                </button>
              </>
            )}
          </Section>
        </div>

        <aside className="order-first space-y-4 lg:sticky lg:top-20 lg:order-last lg:self-start">
          <Card className="space-y-4 p-5">
            <Preview event={previewEvent} roomNames={draft.roomIds.map((id) => roomMap.get(id)?.name ?? '')} />
            <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
              <input type="checkbox" className="size-4 accent-brand-900" checked={draft.visible} onChange={(e) => update({ visible: e.target.checked })} />
              {draft.visible ? <Eye className="size-4 text-slate-500" /> : <EyeOff className="size-4 text-slate-500" />}
              <span>
                <span className="font-medium text-slate-900">Visibile sul cartello</span>
                <span className="block text-xs text-slate-500">Se nascosto è una bozza: non appare e non occupa le sale.</span>
              </span>
            </label>
            {conflicts.length > 0 && (
              <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="size-4" />
                  Sovrapposizioni
                </div>
                <ConflictList conflicts={conflicts} rooms={roomMap} />
              </div>
            )}
            {save.isError && !(save.error instanceof HttpError && save.error.status === 409) && <ErrorNote>{errorMessage(save.error)}</ErrorNote>}
            {showErrors && !inputs && <ErrorNote>Controlla i campi evidenziati.</ErrorNote>}
            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" busy={save.isPending} onClick={() => void submit()}>
                {mode === 'new' && draft.dates.length > 1 ? `Crea ${draft.dates.length} eventi` : 'Salva'}
              </Button>
              <Link to={`/admin?d=${backTo}`} className={buttonClass()}>
                Annulla
              </Link>
            </div>
            {mode === 'edit' && (
              <Button
                variant="ghost"
                className="w-full text-red-600!"
                busy={remove.isPending}
                onClick={async () => {
                  if (await confirm(`Eliminare «${draft.title}»?`, { confirmLabel: 'Elimina', danger: true })) remove.mutate();
                }}
              >
                <Trash2 className="size-4" />
                Elimina evento
              </Button>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

export default function EventEditor({ mode }: { mode: Mode }) {
  const params = useParams();
  const [search] = useSearchParams();
  const id = mode === 'new' ? undefined : Number(params['id']);
  const source = useEvent(id);
  const rooms = useRooms();
  const organizers = useOrganizers();
  const settings = useSettings();

  if (source.isError) return <ErrorNote>{errorMessage(source.error)}</ErrorNote>;
  if ((id !== undefined && source.isPending) || rooms.isPending || organizers.isPending || settings.isPending) return <PageLoading />;
  if (rooms.isError || organizers.isError) return <ErrorNote>{errorMessage(rooms.error ?? organizers.error)}</ErrorNote>;

  const { prepTime, cleanupTime, cleanupMinGapHours } = settings.data ?? DEFAULT_SETTINGS;
  const changeover = { prepTime, cleanupTime, cleanupMinGapHours };
  const initial = source.data ? draftFrom(source.data, changeover) : newDraft(search);
  return (
    <EditorForm
      key={`${mode}-${id ?? 'new'}`}
      mode={mode}
      initial={initial}
      eventId={mode === 'edit' ? id : undefined}
      rooms={rooms.data}
      organizers={organizers.data}
      changeover={changeover}
      backTo={search.get('d') ?? initial.dates[0] ?? todayValue()}
    />
  );
}
