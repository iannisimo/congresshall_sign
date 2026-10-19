import { Plus, Trash2, X } from 'lucide-react';
import { BREAK_PRESETS, type Room } from '../../shared/model.ts';
import { changeoverMargins, type ChangeoverSettings as Changeover, DAY, DEFAULT_DURATION_MINUTES, MINUTE } from '../../shared/time.ts';
import { formatAdminShortDay, formatAdminTime } from '../lib/format.ts';
import { atTime, fromDateTimeValue, toDateTimeValue, todayValue, toTimeValue } from './dates.ts';
import { Field, inputClass } from './ui.tsx';

/**
 * How the preparation and clean-up of a booking are chosen: the usual ones from the settings, none, or
 * custom minutes before the start and after the end.
 */
export type MarginMode = 'changeover' | 'none' | 'custom';

export interface DraftBreak {
  label: string;
  start: string;
  end: string;
}

/** One room occupation of a day, as times of day (on the day's date) plus the margin mode. */
export interface DraftBooking {
  /** Only for React keys. */
  key: number;
  label: string;
  roomIds: number[];
  start: string;
  end: string;
  margins: MarginMode;
  /** Used with custom margins. */
  prepMinutes: number;
  cleanupMinutes: number;
  /** Pauses as times of day. */
  breaks: DraftBreak[];
}

export type BookingFieldKey = 'rooms' | 'times' | 'prep' | 'cleanup' | 'breaks' | 'label';

export type BookingErrors = Partial<Record<BookingFieldKey, string>>;

export function margins(booking: DraftBooking, startAt: number, endAt: number, changeover: Changeover): { prepAt: number; releaseAt: number } {
  switch (booking.margins) {
    case 'changeover':
      return changeoverMargins(startAt, endAt, changeover);
    case 'none':
      return { prepAt: startAt, releaseAt: endAt };
    case 'custom':
      return { prepAt: startAt - booking.prepMinutes * MINUTE, releaseAt: endAt + booking.cleanupMinutes * MINUTE };
  }
}

export function shiftTime(time: string, minutes: number): string {
  const t = atTime(todayValue(), time);
  return t === null ? time : toTimeValue(t + minutes * MINUTE);
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

/** One room occupation: label, rooms, times, breaks and the preparation/clean-up of the room. */
export function BookingCard({
  index,
  booking,
  onChange,
  onRemove,
  bookable,
  changeover,
  built,
  errors,
}: {
  index: number;
  booking: DraftBooking;
  onChange: (patch: Partial<DraftBooking>) => void;
  onRemove: () => void;
  bookable: Room[];
  changeover: Changeover;
  /** The booking's resulting times, null while the times can't be read. */
  built: { prepAt: number; startAt: number; endAt: number; releaseAt: number } | null;
  /** Errors to show (empty until the first save attempt). */
  errors: BookingErrors;
}) {
  const { prepTime, cleanupTime, cleanupMinGapHours } = changeover;
  const overnight = booking.start !== '' && booking.end !== '' && booking.end <= booking.start;
  return (
    <div className="space-y-5 rounded-xl bg-slate-50/60 p-4 ring-1 ring-slate-200">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-700">Occupazione {index + 1}</span>
        <input
          className={`${inputClass} max-w-xs flex-1`}
          value={booking.label}
          maxLength={80}
          placeholder="Nome interno (es. Plenaria, Workshop)"
          aria-label="Nome interno"
          onChange={(e) => onChange({ label: e.target.value })}
        />
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
          aria-label="Togli occupazione"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <Field label="Sale" error={errors.rooms}>
        <div className="flex flex-wrap gap-2">
          {bookable.map((room) => {
            const on = booking.roomIds.includes(room.id);
            return (
              <button
                key={room.id}
                type="button"
                onClick={() => {
                  const ids = new Set(booking.roomIds);
                  if (on) ids.delete(room.id);
                  else ids.add(room.id);
                  // Keep the rooms in display order.
                  onChange({ roomIds: bookable.filter((r) => ids.has(r.id)).map((r) => r.id) });
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

      <Field label="Orario" error={errors.times} hint={overnight ? 'Termina il giorno dopo' : undefined}>
        <div className="flex items-center gap-2">
          <input
            type="time"
            className={`${inputClass} w-auto!`}
            value={booking.start}
            onChange={(e) => {
              // Moving the start keeps the duration.
              const oldStart = atTime(todayValue(), booking.start);
              const oldEnd = atTime(todayValue(), booking.end);
              const duration = oldStart !== null && oldEnd !== null ? (oldEnd - oldStart + DAY) % DAY : DEFAULT_DURATION_MINUTES * MINUTE;
              onChange({ start: e.target.value, end: shiftTime(e.target.value, duration / MINUTE) });
            }}
          />
          <span className="text-slate-400">–</span>
          <input type="time" className={`${inputClass} w-auto!`} value={booking.end} onChange={(e) => onChange({ end: e.target.value })} />
        </div>
      </Field>

      <Field
        label="Pause"
        error={errors.breaks}
        hint="Durante l’evento il cartello mostra la prossima pausa. I nomi appaiono sul cartello: meglio in inglese."
      >
        <BreaksEditor breaks={booking.breaks} onChange={(breaks) => onChange({ breaks })} eventStart={booking.start} eventEnd={booking.end} />
      </Field>

      <Field
        label="Preparazione e riordino della sala"
        error={booking.margins === 'custom' ? undefined : (errors.prep ?? errors.cleanup)}
        hint={
          built && booking.margins !== 'custom'
            ? `Sala riservata dalle ${formatAdminTime(built.prepAt)} di ${formatAdminShortDay(built.prepAt)} alle ${formatAdminTime(built.releaseAt)} di ${formatAdminShortDay(built.releaseAt)}`
            : undefined
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <MarginOption
            selected={booking.margins === 'changeover'}
            onSelect={() => onChange({ margins: 'changeover' })}
            title={`Dalle ${prepTime} del giorno prima`}
            description={`Fino alle ${cleanupTime} dopo la fine (lo stesso giorno se finisce almeno ${cleanupMinGapHours} ${cleanupMinGapHours === 1 ? 'ora' : 'ore'} prima). Tra i giorni di un congresso la sala resta riservata.`}
          />
          <MarginOption
            selected={booking.margins === 'none'}
            onSelect={() => onChange({ margins: 'none' })}
            title="Nessuna preparazione né riordino"
            description="La sala è riservata solo durante l’evento."
          />
        </div>
        {booking.margins !== 'custom' && (
          <button
            type="button"
            className="mt-2 text-sm font-medium text-brand-800 hover:underline"
            onClick={() =>
              // Start from what is shown now, so the times only change when edited.
              onChange({
                margins: 'custom',
                ...(built && {
                  prepMinutes: Math.round((built.startAt - built.prepAt) / MINUTE),
                  cleanupMinutes: Math.round((built.releaseAt - built.endAt) / MINUTE),
                }),
              })
            }
          >
            Orari personalizzati…
          </button>
        )}
      </Field>
      {booking.margins === 'custom' && (
        <>
          <MarginField
            label="Preparazione della sala"
            minutes={booking.prepMinutes}
            onChange={(prepMinutes) => onChange({ prepMinutes })}
            anchor={built?.startAt ?? null}
            direction="before"
            describe={(t) => `Sala riservata dalle ${formatAdminTime(t)} (${formatAdminShortDay(t)})`}
            error={errors.prep}
          />
          <MarginField
            label="Riordino dopo l’evento"
            minutes={booking.cleanupMinutes}
            onChange={(cleanupMinutes) => onChange({ cleanupMinutes })}
            anchor={built?.endAt ?? null}
            direction="after"
            describe={(t) => `La sala torna libera alle ${formatAdminTime(t)} (${formatAdminShortDay(t)})`}
            error={errors.cleanup}
          />
          <button type="button" className="text-sm font-medium text-brand-800 hover:underline" onClick={() => onChange({ margins: 'changeover' })}>
            Torna alle impostazioni consuete
          </button>
        </>
      )}
    </div>
  );
}
