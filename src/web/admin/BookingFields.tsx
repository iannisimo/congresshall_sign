import { ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { BREAK_PRESETS, type Room } from '../../shared/model.ts';
import { DAY, DEFAULT_DURATION_MINUTES, MINUTE } from '../../shared/time.ts';
import { atTime, todayValue, toTimeValue } from './dates.ts';
import { Field, inputClass } from './ui.tsx';

export interface DraftBreak {
  label: string;
  start: string;
  end: string;
}

/** One room occupation of a day, as times of day (on the day's date). */
export interface DraftBooking {
  /** Only for React keys. */
  key: number;
  label: string;
  roomIds: number[];
  start: string;
  end: string;
  /** Pauses as times of day. */
  breaks: DraftBreak[];
}

export type BookingFieldKey = 'rooms' | 'times' | 'breaks' | 'label';

export type BookingErrors = Partial<Record<BookingFieldKey, string>>;

export function shiftTime(time: string, minutes: number): string {
  const t = atTime(todayValue(), time);
  return t === null ? time : toTimeValue(t + minutes * MINUTE);
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

/** One room occupation as a tight row (rooms, times, breaks); it opens for editing. */
export function BookingCard({
  index,
  booking,
  onChange,
  onRemove,
  bookable,
  errors,
}: {
  index: number;
  booking: DraftBooking;
  onChange: (patch: Partial<DraftBooking>) => void;
  onRemove: () => void;
  bookable: Room[];
  /** Errors to show (empty until the first save attempt). */
  errors: BookingErrors;
}) {
  const overnight = booking.start !== '' && booking.end !== '' && booking.end <= booking.start;
  const hasErrors = Object.keys(errors).length > 0;
  // A booking with no rooms yet is new: open it right away.
  const [open, setOpen] = useState(booking.roomIds.length === 0);
  const isOpen = open || hasErrors;
  const chosen = bookable.filter((r) => booking.roomIds.includes(r.id));
  const breaksSummary = booking.breaks.length === 0 ? '' : booking.breaks.length === 1 ? '1 pausa' : `${booking.breaks.length} pause`;

  return (
    <div className={`rounded-xl ring-1 ${hasErrors ? 'bg-red-50/40 ring-red-200' : 'bg-slate-50/60 ring-slate-200'}`}>
      <div className="flex items-center gap-1 pr-2">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setOpen(!isOpen)}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-left hover:bg-slate-100/60"
        >
          <ChevronRight className={`size-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          <span className="text-sm font-semibold whitespace-nowrap text-slate-900 tabular-nums">
            {booking.start || '--:--'}–{booking.end || '--:--'}
            {overnight && <span className="ml-1 text-xs font-normal text-slate-500">(+1)</span>}
          </span>
          <span className="flex flex-wrap gap-1">
            {chosen.length === 0 ? (
              <span className="text-sm text-slate-400">nessuna sala</span>
            ) : (
              chosen.map((r) => (
                <span key={r.id} className="rounded-full bg-brand-900 px-2 py-0.5 text-xs font-medium text-white">
                  {r.name}
                </span>
              ))
            )}
          </span>
          {booking.label && <span className="truncate text-sm text-slate-600">{booking.label}</span>}
          {breaksSummary && <span className="text-xs text-slate-500">{breaksSummary}</span>}
          {!booking.label && <span className="sr-only">Occupazione {index + 1}</span>}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
          aria-label="Togli occupazione"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {isOpen && (
        <div className="space-y-4 border-t border-slate-200 p-3">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <Field label="Nome interno" error={errors.label}>
              <input
                className={inputClass}
                value={booking.label}
                maxLength={80}
                placeholder="Es. Plenaria, Workshop"
                onChange={(e) => onChange({ label: e.target.value })}
              />
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
          </div>

          <Field label="Sale" error={errors.rooms}>
            <div className="flex flex-wrap gap-1.5">
              {bookable.map((room) => {
                const on = booking.roomIds.includes(room.id);
                return (
                  <button
                    key={room.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const ids = new Set(booking.roomIds);
                      if (on) ids.delete(room.id);
                      else ids.add(room.id);
                      // Keep the rooms in display order.
                      onChange({ roomIds: bookable.filter((r) => ids.has(r.id)).map((r) => r.id) });
                    }}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ${on ? 'bg-brand-900 text-white ring-brand-900' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}
                  >
                    {room.name}
                  </button>
                );
              })}
              {bookable.length === 0 && <span className="text-sm text-slate-500">Nessuna sala configurata.</span>}
            </div>
          </Field>

          <Field
            label="Pause"
            error={errors.breaks}
            hint="Durante l’evento il cartello mostra la prossima pausa. I nomi appaiono sul cartello: meglio in inglese."
          >
            <BreaksEditor breaks={booking.breaks} onChange={(breaks) => onChange({ breaks })} eventStart={booking.start} eventEnd={booking.end} />
          </Field>
        </div>
      )}
    </div>
  );
}
