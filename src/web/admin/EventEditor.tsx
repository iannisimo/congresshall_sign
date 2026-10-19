import { useMutation } from '@tanstack/react-query';
import { addDays, differenceInCalendarDays } from 'date-fns';
import { AlertTriangle, ArrowLeft, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { findConflicts } from '../../shared/conflicts.ts';
import { flattenEvents } from '../../shared/events.ts';
import type { Conflict, Organizer, Room, ScheduledEvent, SignEvent } from '../../shared/model.ts';
import { eventInputSchema, type EventInput } from '../../shared/schemas.ts';
import { changeoverMargins, type ChangeoverSettings as Changeover, DAY, DEFAULT_DURATION_MINUTES, MINUTE } from '../../shared/time.ts';
import { DEFAULT_SETTINGS } from '../../shared/settings.ts';
import { formatAdminShortDay, formatAdminTime } from '../lib/format.ts';
import { api, errorMessage, HttpError, refreshSchedule, useEvent, useEvents, useOrganizers, useRooms, useSettings } from './api.ts';
import { margins, shiftTime, type BookingErrors, type BookingFieldKey, type DraftBooking, type MarginMode } from './BookingFields.tsx';
import { atTime, dateShortcut, dayLabel, fromDateValue, toDateValue, todayValue, toTimeValue } from './dates.ts';
import { DayTab, type DayErrors, type DraftDay } from './DayTab.tsx';
import { LogoPicker, OrganizerPicker } from './OrganizerFields.tsx';
import { SignCardPreview } from './SignPreview.tsx';
import { Button, buttonClass, Card, ErrorNote, Field, inputClass, PageLoading, useFeedback } from './ui.tsx';

type Mode = 'new' | 'edit' | 'clone';

const MAX_DAYS = 60;

interface Draft {
  organizerId: number | null;
  logoId: number | null;
  title: string;
  subtitle: string;
  visible: boolean;
  /** Whole event. */
  receptionNotes: string;
  days: DraftDay[];
}

let nextKey = 1;

function newBooking(patch: Partial<DraftBooking> = {}): DraftBooking {
  const start = patch.start ?? '09:00';
  return {
    key: nextKey++,
    label: '',
    roomIds: [],
    start,
    end: shiftTime(start, DEFAULT_DURATION_MINUTES),
    margins: 'changeover',
    prepMinutes: 30,
    cleanupMinutes: 30,
    breaks: [],
    ...patch,
  };
}

/** Same bookings, new keys, so a copy can be edited on its own. */
function cloneBookings(bookings: DraftBooking[]): DraftBooking[] {
  return bookings.map((b) => ({ ...b, key: nextKey++, roomIds: [...b.roomIds], breaks: b.breaks.map((x) => ({ ...x })) }));
}

/** A booking after the last one of the day, with no rooms ticked. */
function bookingAfter(last: DraftBooking | undefined): DraftBooking {
  const start = last && last.end > last.start && last.end < '23:00' ? last.end : '09:00';
  return newBooking({ start });
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
    visible: true,
    receptionNotes: '',
    days: [{ date, receptionNotes: '', housekeepingNotes: '', bookings: [newBooking({ start, roomIds: room > 0 ? [room] : [] })] }],
  };
}

function draftFrom(event: ScheduledEvent, changeover: Changeover): Draft {
  return {
    organizerId: event.organizerId,
    logoId: event.logoId,
    title: event.title,
    subtitle: event.subtitle ?? '',
    visible: event.visible,
    receptionNotes: event.receptionNotes ?? '',
    days: event.days.map((day) => ({
      date: day.date,
      receptionNotes: day.receptionNotes ?? '',
      housekeepingNotes: day.housekeepingNotes ?? '',
      bookings: day.bookings.map((b) => {
        const defaults = changeoverMargins(b.startAt, b.endAt, changeover);
        const mode: MarginMode =
          b.prepAt === defaults.prepAt && b.releaseAt === defaults.releaseAt
            ? 'changeover'
            : b.prepAt === b.startAt && b.releaseAt === b.endAt
              ? 'none'
              : 'custom';
        return {
          key: nextKey++,
          label: b.label ?? '',
          roomIds: b.roomIds,
          start: toTimeValue(b.startAt),
          end: toTimeValue(b.endAt),
          margins: mode,
          prepMinutes: Math.round((b.startAt - b.prepAt) / MINUTE),
          cleanupMinutes: Math.round((b.releaseAt - b.endAt) / MINUTE),
          breaks: b.breaks.map((br) => ({ label: br.label, start: toTimeValue(br.startAt), end: toTimeValue(br.endAt) })),
        };
      }),
    })),
  };
}

type BuiltBooking = { prepAt: number; startAt: number; endAt: number; releaseAt: number };

/** The API input, plus each booking's times (null where they can't be read). Ends before the start mean the next day. */
function buildInput(draft: Draft, changeover: Changeover): { input: EventInput; built: (BuiltBooking | null)[][]; unreadable: boolean[][] } {
  const built: (BuiltBooking | null)[][] = [];
  const unreadable: boolean[][] = [];
  const days = draft.days.map((day, i) => {
    built[i] = [];
    unreadable[i] = [];
    const bookings = [];
    for (const b of day.bookings) {
      const startAt = atTime(day.date, b.start);
      let endAt = atTime(day.date, b.end);
      if (startAt === null || endAt === null) {
        built[i]!.push(null);
        unreadable[i]!.push(true);
        continue;
      }
      if (endAt <= startAt) endAt += DAY;
      const { prepAt, releaseAt } = margins(b, startAt, endAt, changeover);
      // Break times are on the booking's day; in bookings past midnight, earlier times are the next day.
      const breaks = [];
      let bad = false;
      for (const br of b.breaks) {
        let breakStart = atTime(day.date, br.start);
        let breakEnd = atTime(day.date, br.end);
        if (breakStart === null || breakEnd === null) {
          bad = true;
          break;
        }
        if (breakStart < startAt) breakStart += DAY;
        if (breakEnd <= breakStart) breakEnd += DAY;
        breaks.push({ label: br.label, startAt: breakStart, endAt: breakEnd });
      }
      built[i]!.push({ prepAt, startAt, endAt, releaseAt });
      unreadable[i]!.push(bad);
      if (!bad) bookings.push({ label: b.label.trim() || null, roomIds: b.roomIds, prepAt, startAt, endAt, releaseAt, breaks });
    }
    return { date: day.date, receptionNotes: day.receptionNotes, housekeepingNotes: day.housekeepingNotes, bookings };
  });
  const input: EventInput = {
    organizerId: draft.organizerId ?? 0,
    logoId: draft.logoId,
    title: draft.title,
    subtitle: draft.subtitle.trim() || null,
    visible: draft.visible,
    receptionNotes: draft.receptionNotes,
    days,
  };
  return { input, built, unreadable };
}

type EventFieldKey = 'organizer' | 'title' | 'subtitle' | 'receptionNotes';

interface Errors {
  event: Partial<Record<EventFieldKey, string>>;
  days: DayErrors[];
  bookings: BookingErrors[][];
  /** Issues that belong to no field. */
  general: string[];
  any: boolean;
}

const EVENT_FIELD_OF: Record<string, EventFieldKey> = {
  organizerId: 'organizer',
  title: 'title',
  subtitle: 'subtitle',
  receptionNotes: 'receptionNotes',
};

const BOOKING_FIELD_OF: Record<string, BookingFieldKey> = {
  label: 'label',
  roomIds: 'rooms',
  startAt: 'times',
  endAt: 'times',
  prepAt: 'prep',
  releaseAt: 'cleanup',
  breaks: 'breaks',
};

/** Validates the built input and maps the zod paths (days.2.bookings.0.roomIds) to the tab and booking. */
function validate(draft: Draft, input: EventInput, unreadable: boolean[][]): Errors {
  const errors: Errors = {
    event: {},
    days: draft.days.map(() => ({})),
    bookings: draft.days.map((d) => d.bookings.map(() => ({}))),
    general: [],
    any: false,
  };
  if (draft.organizerId === null) errors.event.organizer = 'Scegli o crea un organizzatore';
  let unreadableFound = false;
  unreadable.forEach((day, i) =>
    day.forEach((bad, j) => {
      if (bad) {
        errors.bookings[i]![j]!.times = 'Controlla gli orari';
        unreadableFound = true;
      }
    }),
  );
  if (!unreadableFound) {
    const result = eventInputSchema.safeParse(input);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const [head, i, second, j, field] = issue.path;
        if (head === 'days' && typeof i === 'number') {
          if (second === 'bookings' && typeof j === 'number') {
            const key = BOOKING_FIELD_OF[String(field)];
            const target = errors.bookings[i]?.[j];
            if (key && target) target[key] ??= issue.message;
            else errors.general.push(issue.message);
          } else if (second === 'bookings') {
            errors.days[i]!.bookings ??= issue.message;
          } else if (second === 'receptionNotes' || second === 'housekeepingNotes') {
            errors.days[i]![second] ??= issue.message;
          } else errors.general.push(issue.message);
        } else {
          const key = EVENT_FIELD_OF[String(head)];
          if (key) errors.event[key] ??= key === 'organizer' ? 'Scegli o crea un organizzatore' : issue.message;
          else errors.general.push(issue.message);
        }
      }
    }
  }
  errors.any =
    Object.keys(errors.event).length > 0 ||
    errors.general.length > 0 ||
    errors.days.some((d) => Object.keys(d).length > 0) ||
    errors.bookings.some((day) => day.some((b) => Object.keys(b).length > 0));
  return errors;
}

function dayHasErrors(errors: Errors, i: number): boolean {
  return Object.keys(errors.days[i] ?? {}).length > 0 || (errors.bookings[i] ?? []).some((b) => Object.keys(b).length > 0);
}

function dayHasContent(day: DraftDay): boolean {
  return day.bookings.length > 0 || day.receptionNotes.trim() !== '' || day.housekeepingNotes.trim() !== '';
}

/** Conflicts of one booking with other events. */
interface DayConflict {
  dayIndex: number;
  date: string;
  conflicts: Conflict[];
}

/** The booking as it will look on the sign (ADMIN-4), scaled to the available width. */
function Preview({ event, roomNames }: { event: SignEvent; roomNames: string[] }) {
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

function ConflictList({
  conflicts,
  rooms,
  onSelectDay,
}: {
  conflicts: DayConflict[];
  rooms: Map<number, Room>;
  /** Makes the day of each line a link to its tab. */
  onSelectDay?: (dayIndex: number) => void;
}) {
  return (
    <ul className="mt-1 space-y-1">
      {conflicts.flatMap((c) =>
        c.conflicts.map((x) => (
          <li key={`${c.date}-${x.booking.id}`}>
            {onSelectDay ? (
              <button type="button" className="font-semibold underline" onClick={() => onSelectDay(c.dayIndex)}>
                {dayLabel(c.date)}
              </button>
            ) : (
              <span className="font-semibold">{dayLabel(c.date)}</span>
            )}
            : <span className="font-medium">{x.roomIds.map((id) => rooms.get(id)?.name).join(', ')}</span>: «{x.booking.title}»{' '}
            {formatAdminShortDay(x.booking.startAt)} {formatAdminTime(x.booking.startAt)}–{formatAdminTime(x.booking.endAt)}
            {!x.booking.visible && ' (nascosto)'}
          </li>
        )),
      )}
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
  const [search, setSearch] = useSearchParams();
  const [draft, setDraft] = useState(initial);
  const [showErrors, setShowErrors] = useState(false);
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // The selected day tab lives in the URL (?day=YYYY-MM-DD): default today's tab, else the first.
  const [selectedIndex, setSelected] = useState(() => {
    const wanted = initial.days.findIndex((d) => d.date === search.get('day'));
    if (wanted >= 0) return wanted;
    return Math.max(0, initial.days.findIndex((d) => d.date === todayValue()));
  });
  const sel = Math.min(selectedIndex, draft.days.length - 1);
  const selDay = draft.days[sel]!;
  useEffect(() => {
    if (search.get('day') === selDay.date) return;
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('day', selDay.date);
        return next;
      },
      { replace: true },
    );
  }, [selDay.date, search, setSearch]);

  const roomMap = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const bookable = rooms.filter((r) => r.kind === 'main');
  const organizer = organizers.find((o) => o.id === draft.organizerId);

  const { input, built, unreadable } = buildInput(draft, changeover);
  const errors = validate(draft, input, unreadable);
  const startDate = draft.days[0]!.date;
  const endDate = draft.days[draft.days.length - 1]!.date;

  // Conflicts with other saved events, checked while editing (ADMIN-7), for every day.
  const readable = built.flat().filter((b): b is BuiltBooking => b !== null);
  const range = readable.length > 0 ? { from: Math.min(...readable.map((b) => b.prepAt)), to: Math.max(...readable.map((b) => b.releaseAt)) } : null;
  const others = useEvents(range?.from ?? 0, range?.to ?? 1, { enabled: range !== null, keepPrevious: true });
  const conflicts: DayConflict[] = useMemo(() => {
    if (!others.data) return [];
    const flat = flattenEvents(others.data);
    return draft.days.flatMap((day, i) => {
      const found = day.bookings.flatMap((b, j) => {
        const times = built[i]?.[j];
        if (!times || b.roomIds.length === 0) return [];
        return findConflicts({ ...(eventId !== undefined && { eventId }), roomIds: b.roomIds, startAt: times.startAt, endAt: times.endAt }, flat);
      });
      return found.length > 0 ? [{ dayIndex: i, date: day.date, conflicts: found }] : [];
    });
  }, [others.data, draft.days, eventId, changeover]);
  const conflictCount = conflicts.reduce((n, c) => n + c.conflicts.length, 0);

  const save = useMutation({
    mutationFn: (allowConflicts: boolean) =>
      mode === 'edit'
        ? api(`/events/${eventId}`, { method: 'PUT', json: { event: input, allowConflicts } })
        : api('/events', { method: 'POST', json: { event: input, allowConflicts } }),
    onSuccess: () => {
      refreshSchedule();
      toast('Evento salvato');
      navigate(`/admin?d=${backTo}`);
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
    if (errors.any) {
      // Jump to the first day with a problem.
      const first = draft.days.findIndex((_, i) => dayHasErrors(errors, i));
      if (first >= 0 && !dayHasErrors(errors, sel)) setSelected(first);
      return;
    }
    if (
      conflictCount > 0 &&
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
      await save.mutateAsync(conflictCount > 0);
    } catch (error) {
      // Someone else booked the room in the meantime.
      if (error instanceof HttpError && error.status === 409 && error.body?.conflicts) {
        if (await confirm('Nel frattempo è stato salvato un evento che si sovrappone. Salvare comunque?', { confirmLabel: 'Salva comunque' })) {
          await save.mutateAsync(true).catch(() => {});
        }
      }
    }
  }

  // Days.
  const setDays = (days: DraftDay[]) => update({ days });
  const updateDay = (i: number, patch: Partial<DraftDay>) => setDays(draft.days.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const updateBooking = (i: number, j: number, patch: Partial<DraftBooking>) =>
    updateDay(i, { bookings: draft.days[i]!.bookings.map((b, k) => (k === j ? { ...b, ...patch } : b)) });

  /** Moving "Dal" moves the whole event, keeping its length; the times of day stay. */
  function changeStart(value: string) {
    const to = fromDateValue(value);
    const from = fromDateValue(startDate);
    if (to === null || from === null) return;
    const delta = differenceInCalendarDays(to, from);
    if (delta === 0) return;
    setDays(draft.days.map((d) => ({ ...d, date: toDateValue(addDays(fromDateValue(d.date) ?? from, delta).getTime()) })));
  }

  /** "Al" adds days at the end (copying the previous day's bookings) or removes them. */
  async function changeEnd(value: string) {
    const to = fromDateValue(value);
    const from = fromDateValue(startDate);
    if (to === null || from === null) return;
    const count = differenceInCalendarDays(to, from) + 1;
    if (count < 1) {
      toast('L’ultimo giorno non può precedere il primo', 'error');
      return;
    }
    if (count > MAX_DAYS) {
      toast(`Un evento può durare al massimo ${MAX_DAYS} giorni`, 'error');
      return;
    }
    const length = draft.days.length;
    if (count === length) return;
    if (count < length) {
      const removed = draft.days.slice(count);
      if (
        removed.some(dayHasContent) &&
        !(await confirm(`Togliere ${removed.length === 1 ? 'il giorno' : `gli ultimi ${removed.length} giorni`} con le loro occupazioni e note?`, {
          confirmLabel: 'Togli',
          danger: true,
        }))
      ) {
        return;
      }
      setDays(draft.days.slice(0, count));
      return;
    }
    const added: DraftDay[] = [];
    let previous = draft.days[length - 1]!;
    for (let n = length; n < count; n++) {
      const day = {
        date: toDateValue(addDays(from, n).getTime()),
        receptionNotes: '',
        housekeepingNotes: '',
        bookings: cloneBookings(previous.bookings),
      };
      added.push(day);
      previous = day;
    }
    setDays([...draft.days, ...added]);
  }

  async function removeDay(i: number) {
    const day = draft.days[i]!;
    if (dayHasContent(day) && !(await confirm(`Togliere ${dayLabel(day.date)} con le sue occupazioni e note?`, { confirmLabel: 'Togli', danger: true }))) return;
    setDays(draft.days.filter((_, j) => j !== i));
  }

  async function applyFollowing(i: number) {
    if (!(await confirm('Sostituire le occupazioni di tutti i giorni seguenti con quelle di questo giorno?', { confirmLabel: 'Applica' }))) return;
    setDays(draft.days.map((d, j) => (j > i ? { ...d, bookings: cloneBookings(draft.days[i]!.bookings) } : d)));
  }

  const dayErrors = (i: number): DayErrors => (showErrors ? (errors.days[i] ?? {}) : {});
  const shown = (key: EventFieldKey) => (showErrors ? errors.event[key] : undefined);
  const hasConflict = (i: number) => conflicts.some((c) => c.dayIndex === i);

  const firstBooking = selDay.bookings[0];
  const firstTimes = built[sel]?.[0] ?? null;
  const previewEvent: SignEvent | null =
    firstBooking && firstTimes
      ? {
          id: 0,
          eventId: eventId ?? 0,
          date: selDay.date,
          organizerId: draft.organizerId ?? 0,
          organizerName: organizer?.name ?? 'Organizzatore',
          logoId: draft.logoId,
          title: draft.title.trim() || 'Titolo dell’evento',
          subtitle: draft.subtitle.trim() || null,
          roomIds: firstBooking.roomIds,
          ...firstTimes,
          breaks: (input.days[sel]?.bookings[0]?.breaks ?? []).map((b) => ({ ...b, label: b.label.trim() || 'Break' })),
          visible: draft.visible,
        }
      : null;
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
          </Section>

          <Section title="Date">
            <div className="flex flex-wrap items-start gap-4">
              <Field label="Dal">
                <input
                  type="date"
                  className={`${inputClass} w-auto!`}
                  value={startDate}
                  onChange={(e) => changeStart(e.target.value)}
                  onKeyDown={(e) => {
                    const value = dateShortcut(e);
                    if (value) changeStart(value);
                  }}
                />
              </Field>
              <Field label="Al">
                <input
                  type="date"
                  className={`${inputClass} w-auto!`}
                  value={endDate}
                  min={startDate}
                  onChange={(e) => void changeEnd(e.target.value)}
                  onKeyDown={(e) => {
                    const value = dateShortcut(e);
                    if (value) void changeEnd(value);
                  }}
                />
              </Field>
            </div>
            <p className="-mt-2 text-sm text-slate-500">
              Cambiando «Dal» si sposta tutto l’evento; cambiando «Al» si aggiungono o si tolgono giorni in fondo. Tasti rapidi: o = oggi, d = domani.
            </p>
          </Section>

          <Section title="Reception (tutto l’evento)">
            <Field label="Note per la reception" error={shown('receptionNotes')} hint="Facoltativo. Non appaiono sul cartello.">
              <textarea
                className={`${inputClass} min-h-24`}
                value={draft.receptionNotes}
                maxLength={4000}
                onChange={(e) => update({ receptionNotes: e.target.value })}
              />
            </Field>
          </Section>

          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold tracking-wide text-slate-500 uppercase">Giorni</h2>
            <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
              {draft.days.map((day, i) => {
                const flagged = (showErrors && dayHasErrors(errors, i)) || hasConflict(i);
                return (
                  <button
                    key={day.date}
                    type="button"
                    role="tab"
                    aria-selected={i === sel}
                    onClick={() => setSelected(i)}
                    className={`relative -mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${i === sel ? 'border-brand-600 text-brand-900' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
                  >
                    {dayLabel(day.date)}
                    <span className="rounded-full bg-slate-100 px-1.5 text-xs text-slate-600" title="Occupazioni">
                      {day.bookings.length}
                    </span>
                    {flagged && <span className="size-2 rounded-full bg-amber-500" title="Da controllare" />}
                  </button>
                );
              })}
            </div>
            <DayTab
              key={selDay.date}
              index={sel}
              days={draft.days}
              bookable={bookable}
              changeover={changeover}
              built={built[sel] ?? []}
              bookingErrors={showErrors ? (errors.bookings[sel] ?? []) : []}
              dayErrors={dayErrors(sel)}
              onChange={(patch) => updateDay(sel, patch)}
              onChangeBooking={(j, patch) => updateBooking(sel, j, patch)}
              onAddBooking={() => updateDay(sel, { bookings: [...selDay.bookings, bookingAfter(selDay.bookings[selDay.bookings.length - 1])] })}
              onRemoveBooking={(j) => updateDay(sel, { bookings: selDay.bookings.filter((_, k) => k !== j) })}
              onCopyPrevious={() => updateDay(sel, { bookings: cloneBookings(draft.days[sel - 1]?.bookings ?? []) })}
              onApplyFollowing={() => void applyFollowing(sel)}
              onRemoveDay={draft.days.length > 1 && (sel === 0 || sel === draft.days.length - 1) ? () => void removeDay(sel) : undefined}
            />
          </Card>
        </div>

        <aside className="order-first space-y-4 lg:sticky lg:top-20 lg:order-last lg:self-start">
          <Card className="space-y-4 p-5">
            {previewEvent ? (
              <Preview event={previewEvent} roomNames={previewEvent.roomIds.map((id) => roomMap.get(id)?.name ?? '')} />
            ) : (
              <p className="text-sm text-slate-500">Nessuna occupazione in {dayLabel(selDay.date)}: non c’è niente da mostrare sul cartello.</p>
            )}
            <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
              <input type="checkbox" className="size-4 accent-brand-900" checked={draft.visible} onChange={(e) => update({ visible: e.target.checked })} />
              {draft.visible ? <Eye className="size-4 text-slate-500" /> : <EyeOff className="size-4 text-slate-500" />}
              <span>
                <span className="font-medium text-slate-900">Visibile sul cartello</span>
                <span className="block text-xs text-slate-500">Se nascosto è una bozza: non appare e non occupa le sale.</span>
              </span>
            </label>
            {/* TASK 9: the "Stampa" button of the event goes here. */}
            {conflictCount > 0 && (
              <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="size-4" />
                  Sovrapposizioni
                </div>
                <ConflictList conflicts={conflicts} rooms={roomMap} onSelectDay={setSelected} />
              </div>
            )}
            {save.isError && !(save.error instanceof HttpError && save.error.status === 409) && <ErrorNote>{errorMessage(save.error)}</ErrorNote>}
            {showErrors && errors.any && (
              <ErrorNote>
                Controlla i campi evidenziati{draft.days.length > 1 ? ' (i giorni con un punto arancione)' : ''}.
                {errors.general.length > 0 && ` ${[...new Set(errors.general)].join(' ')}`}
              </ErrorNote>
            )}
            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" busy={save.isPending} onClick={() => void submit()}>
                Salva
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
                  const n = draft.days.length;
                  const message = n > 1 ? `Eliminare «${draft.title}» e tutti i suoi ${n} giorni?` : `Eliminare «${draft.title}»?`;
                  if (await confirm(message, { confirmLabel: 'Elimina', danger: true })) remove.mutate();
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
      backTo={search.get('d') ?? initial.days[0]?.date ?? todayValue()}
    />
  );
}
