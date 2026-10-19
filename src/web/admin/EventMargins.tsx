import { changeoverMargins, type ChangeoverSettings as Changeover, MINUTE } from '../../shared/time.ts';
import { formatAdminShortDay, formatAdminTime } from '../lib/format.ts';
import { fromDateTimeValue, toDateTimeValue } from './dates.ts';
import { Field, inputClass } from './ui.tsx';

/**
 * How the preparation and clean-up of the event are chosen: the usual ones from the settings, none, or
 * custom minutes before the first start and after the last end.
 */
export type MarginMode = 'changeover' | 'none' | 'custom';

export interface DraftMargins {
  margins: MarginMode;
  /** Used with custom margins. */
  prepMinutes: number;
  cleanupMinutes: number;
}

/** The event's reservation span, from the earliest booking start and the latest booking end. */
export function margins(draft: DraftMargins, firstStart: number, lastEnd: number, changeover: Changeover): { prepAt: number; releaseAt: number } {
  switch (draft.margins) {
    case 'changeover':
      return changeoverMargins(firstStart, lastEnd, changeover);
    case 'none':
      return { prepAt: firstStart, releaseAt: lastEnd };
    case 'custom':
      return { prepAt: firstStart - draft.prepMinutes * MINUTE, releaseAt: lastEnd + draft.cleanupMinutes * MINUTE };
  }
}

function minutesLabel(m: number): string {
  if (m === 0) return 'Nessuna';
  if (m % 60 === 0) return m === 60 ? '1 ora' : `${m / 60} ore`;
  return `${m} min`;
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

const MODE_LABELS: [MarginMode, string][] = [
  ['changeover', 'Consueti'],
  ['none', 'Nessuno'],
  ['custom', 'Personalizzati'],
];

/**
 * The event-level margins, compact: a segmented choice with the resulting span, and the explanation behind
 * a "dettagli" toggle. One preparation and clean-up for all the rooms of the event.
 */
export function MarginsSection({
  value,
  onChange,
  changeover,
  span,
  errors,
  help,
}: {
  value: DraftMargins;
  onChange: (patch: Partial<DraftMargins>) => void;
  changeover: Changeover;
  /** The resulting span with the first start and the last end, null while no booking time can be read. */
  span: { prepAt: number; releaseAt: number; firstStart: number; lastEnd: number } | null;
  errors: { prep?: string | undefined; cleanup?: string | undefined };
  /** Extra explanation shown in the details (about the dates next to it). */
  help?: string;
}) {
  const { prepTime, cleanupTime, cleanupMinGapHours } = changeover;
  const select = (mode: MarginMode) => {
    if (mode !== 'custom') return onChange({ margins: mode });
    // Start from what is shown now, so the times only change when edited.
    onChange({
      margins: 'custom',
      ...(span && {
        prepMinutes: Math.round((span.firstStart - span.prepAt) / MINUTE),
        cleanupMinutes: Math.round((span.releaseAt - span.lastEnd) / MINUTE),
      }),
    });
  };
  return (
    <div className="@container">
      <Field
        label="Preparazione e riordino delle sale"
        error={value.margins === 'custom' ? undefined : (errors.prep ?? errors.cleanup)}
        hint={
          span && value.margins !== 'custom'
            ? `Sale riservate dalle ${formatAdminTime(span.prepAt)} di ${formatAdminShortDay(span.prepAt)} alle ${formatAdminTime(span.releaseAt)} di ${formatAdminShortDay(span.releaseAt)}`
            : undefined
        }
      >
        <div role="radiogroup" className="inline-flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
          {MODE_LABELS.map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={value.margins === mode}
              onClick={() => select(mode)}
              className={`rounded-md px-4 py-1.5 ${value.margins === mode ? 'bg-white text-brand-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>
      <details className="mt-2 text-sm text-slate-600">
        <summary className="cursor-pointer text-slate-500 select-none hover:text-slate-800">dettagli</summary>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>
            <b>Consueti</b>: dalle {prepTime} del giorno prima fino alle {cleanupTime} dopo la fine (lo stesso giorno se finisce almeno {cleanupMinGapHours}{' '}
            {cleanupMinGapHours === 1 ? 'ora' : 'ore'} prima).
          </li>
          <li>
            <b>Nessuno</b>: le sale sono riservate dal primo inizio all’ultima fine.
          </li>
          <li>
            <b>Personalizzati</b>: minuti prima del primo inizio e dopo l’ultima fine, oppure un orario esatto.
          </li>
          <li>Tutte le sale dell’evento restano riservate per l’intera durata, tra un giorno e l’altro compreso.</li>
          {help && <li>{help}</li>}
        </ul>
      </details>
      {value.margins === 'custom' && (
        <div className="mt-4 grid gap-4 @2xl:grid-cols-2">
          <MarginField
            label="Preparazione delle sale"
            minutes={value.prepMinutes}
            onChange={(prepMinutes) => onChange({ prepMinutes })}
            anchor={span?.firstStart ?? null}
            direction="before"
            describe={(t) => `Sale riservate dalle ${formatAdminTime(t)} (${formatAdminShortDay(t)})`}
            error={errors.prep}
          />
          <MarginField
            label="Riordino dopo l’evento"
            minutes={value.cleanupMinutes}
            onChange={(cleanupMinutes) => onChange({ cleanupMinutes })}
            anchor={span?.lastEnd ?? null}
            direction="after"
            describe={(t) => `Le sale tornano libere alle ${formatAdminTime(t)} (${formatAdminShortDay(t)})`}
            error={errors.cleanup}
          />
        </div>
      )}
    </div>
  );
}
