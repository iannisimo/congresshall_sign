import { Copy, CopyCheck, Plus, Trash2 } from 'lucide-react';
import { effectiveDayNotes } from '../../shared/events.ts';
import type { Room } from '../../shared/model.ts';
import type { ChangeoverSettings as Changeover } from '../../shared/time.ts';
import { BookingCard, type BookingErrors, type DraftBooking } from './BookingFields.tsx';
import { dayLabel } from './dates.ts';
import { Button, ErrorNote, Field, inputClass } from './ui.tsx';

export interface DraftDay {
  date: string;
  /** Empty on a day after the first means "same as the previous day". */
  receptionNotes: string;
  housekeepingNotes: string;
  bookings: DraftBooking[];
}

export interface DayErrors {
  /** E.g. "add at least one booking". */
  bookings?: string;
  receptionNotes?: string;
  housekeepingNotes?: string;
}

/** First non-empty line of an inherited note, trimmed for a hint. */
function firstLine(text: string | null): string {
  const line = (text ?? '').split('\n').find((l) => l.trim() !== '')?.trim() ?? '';
  return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}

export function DayTab({
  index,
  days,
  bookable,
  changeover,
  built,
  bookingErrors,
  dayErrors,
  onChange,
  onChangeBooking,
  onAddBooking,
  onRemoveBooking,
  onCopyPrevious,
  onApplyFollowing,
  onRemoveDay,
}: {
  index: number;
  days: DraftDay[];
  bookable: Room[];
  changeover: Changeover;
  /** Resulting times of each booking of this day, null where they can't be read. */
  built: ({ prepAt: number; startAt: number; endAt: number; releaseAt: number } | null)[];
  bookingErrors: BookingErrors[];
  dayErrors: DayErrors;
  onChange: (patch: Partial<DraftDay>) => void;
  onChangeBooking: (bookingIndex: number, patch: Partial<DraftBooking>) => void;
  onAddBooking: () => void;
  onRemoveBooking: (bookingIndex: number) => void;
  onCopyPrevious: () => void;
  onApplyFollowing: () => void;
  /** Only given on the first and last day, while there are several. */
  onRemoveDay: (() => void) | undefined;
}) {
  const day = days[index]!;
  const notes = effectiveDayNotes(
    { days: days.map((d) => ({ receptionNotes: d.receptionNotes.trim() || null, housekeepingNotes: d.housekeepingNotes.trim() || null })) },
    index,
  );
  const noteHint = (field: 'receptionNotes' | 'housekeepingNotes') =>
    index > 0 && notes.inherited[field] && notes[field] ? `Come il giorno precedente: «${firstLine(notes[field])}»` : 'Facoltativo';
  const placeholder = index > 0 ? 'Come il giorno precedente' : '';
  const dash = index > 0 ? ' Scrivi «—» per dire che questo giorno non ha note.' : '';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-slate-900">{dayLabel(day.date)}</h3>
        <div className="ml-auto flex flex-wrap gap-2">
          {index > 0 && (
            <Button size="sm" onClick={onCopyPrevious}>
              <Copy className="size-4" />
              Copia dal giorno precedente
            </Button>
          )}
          {index < days.length - 1 && (
            <Button size="sm" onClick={onApplyFollowing}>
              <CopyCheck className="size-4" />
              Applica ai giorni seguenti
            </Button>
          )}
          {onRemoveDay && (
            <Button size="sm" variant="ghost" className="text-red-600!" onClick={onRemoveDay}>
              <Trash2 className="size-4" />
              Togli questo giorno
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Occupazioni delle sale</div>
        {day.bookings.length === 0 && <p className="text-sm text-slate-500">Nessuna sala occupata in questo giorno.</p>}
        {dayErrors.bookings && <ErrorNote>{dayErrors.bookings}</ErrorNote>}
        {day.bookings.map((booking, j) => (
          <BookingCard
            key={booking.key}
            index={j}
            booking={booking}
            onChange={(patch) => onChangeBooking(j, patch)}
            onRemove={() => onRemoveBooking(j)}
            bookable={bookable}
            changeover={changeover}
            built={built[j] ?? null}
            errors={bookingErrors[j] ?? {}}
          />
        ))}
        <Button size="sm" onClick={onAddBooking}>
          <Plus className="size-4" />
          Aggiungi occupazione
        </Button>
      </div>

      <div className="space-y-5">
        <div className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Note per lo staff (non appaiono sul cartello)</div>
        <Field label="Housekeeping e preparazione sala" error={dayErrors.housekeepingNotes} hint={`${noteHint('housekeepingNotes')}.${dash}`}>
          <textarea
            className={`${inputClass} min-h-24`}
            value={day.housekeepingNotes}
            maxLength={4000}
            placeholder={placeholder}
            onChange={(e) => onChange({ housekeepingNotes: e.target.value })}
          />
        </Field>
        <Field label="Reception (questo giorno)" error={dayErrors.receptionNotes} hint={`${noteHint('receptionNotes')}.${dash}`}>
          <textarea
            className={`${inputClass} min-h-24`}
            value={day.receptionNotes}
            maxLength={4000}
            placeholder={placeholder}
            onChange={(e) => onChange({ receptionNotes: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}
