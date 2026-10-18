import { useMutation } from '@tanstack/react-query';
import { startOfDay } from 'date-fns';
import { useState } from 'react';
import type { ScheduledEvent, Settings } from '../../shared/model.ts';
import { settingsSchema } from '../../shared/schemas.ts';
import { DEFAULT_SETTINGS } from '../../shared/settings.ts';
import { HOUR, MINUTE } from '../../shared/time.ts';
import { api, errorMessage, keys, queryClient, useSettings } from './api.ts';
import { SignCardPreview } from './SignPreview.tsx';
import { Button, Card, ErrorNote, Field, inputClass, PageLoading, useFeedback } from './ui.tsx';

/** A card with texts long enough to scroll, to try the settings on. */
function sampleEvent(): ScheduledEvent {
  const startAt = startOfDay(Date.now()).getTime() + 14 * HOUR;
  return {
    id: 0,
    organizerId: 0,
    organizerName: 'Società Italiana di Cardiologia',
    logoId: null,
    title: 'Congresso Nazionale della Società Italiana di Cardiologia Interventistica',
    subtitle: 'Sessione plenaria: nuove linee guida per il trattamento delle aritmie ventricolari',
    roomIds: [],
    prepAt: startAt - 30 * MINUTE,
    startAt,
    endAt: startAt + 2.5 * HOUR,
    releaseAt: startAt + 3 * HOUR,
    breaks: [],
    visible: true,
  };
}

function NumberWithSlider({
  value,
  onChange,
  min,
  max,
  step,
  unit,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        className="flex-1 accent-brand-900"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        type="number"
        className={`${inputClass} w-24!`}
        min={min}
        max={max}
        step={step}
        value={Number.isNaN(value) ? '' : value}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      />
      <span className="w-20 text-sm text-slate-500">{unit}</span>
    </div>
  );
}

function SettingsForm({ saved }: { saved: Settings }) {
  const { toast } = useFeedback();
  const [draft, setDraft] = useState(saved);
  const [sample] = useState(sampleEvent);

  const result = settingsSchema.safeParse(draft);
  const errors = new Map(result.error?.issues.map((issue) => [String(issue.path[0]), issue.message]) ?? []);
  const changed = (Object.keys(saved) as (keyof Settings)[]).some((key) => draft[key] !== saved[key]);

  const save = useMutation({
    mutationFn: () => api<Settings>('/settings', { method: 'PUT', json: draft }),
    onSuccess: (settings) => {
      queryClient.setQueryData(keys.settings, settings);
      void queryClient.invalidateQueries({ queryKey: keys.display });
      void queryClient.invalidateQueries({ queryKey: keys.settings });
      toast('Impostazioni salvate: il cartello le applica entro un minuto');
    },
  });

  return (
    <div className="space-y-6">
      <Card className="space-y-6 p-5">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Cartello: testi lunghi</h2>
          <p className="mt-1 text-sm text-slate-600">
            I testi che non entrano nel loro spazio (titoli e sottotitoli, e organizzatore e sale nella lista «Coming up»)
            restano fermi all’inizio per qualche secondo, poi scorrono finché il testo ricomincia.
          </p>
        </div>

        <Field label="Velocità" error={errors.get('marqueeSpeed')} hint="Pixel al secondo su uno schermo Full HD; su altre risoluzioni si adatta da sola.">
          <NumberWithSlider
            value={draft.marqueeSpeed}
            onChange={(marqueeSpeed) => setDraft({ ...draft, marqueeSpeed })}
            min={10}
            max={400}
            step={5}
            unit="px/s"
          />
        </Field>
        <Field label="Pausa all’inizio" error={errors.get('marqueePause')}>
          <NumberWithSlider
            value={draft.marqueePause}
            onChange={(marqueePause) => setDraft({ ...draft, marqueePause })}
            min={0}
            max={30}
            step={0.5}
            unit="secondi"
          />
        </Field>

        <div>
          <div className="mb-2 text-sm font-medium text-slate-700">Anteprima</div>
          <SignCardPreview event={sample} roomNames={['Auditorium']} now={sample.prepAt - HOUR} settings={result.success ? result.data : saved} />
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Cartello: tema</h2>
          <p className="mt-1 text-sm text-slate-600">
            Di notte il cartello passa ai colori scuri, meno abbaglianti. Un singolo schermo può forzare il tema aggiungendo{' '}
            <code className="rounded bg-slate-100 px-1">?mode=dark</code> o <code className="rounded bg-slate-100 px-1">?mode=light</code> al suo
            indirizzo.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ['auto', 'Automatico', 'Scuro nelle ore indicate sotto'],
              ['light', 'Sempre chiaro', 'Anche di notte'],
              ['dark', 'Sempre scuro', 'Anche di giorno'],
            ] as const
          ).map(([value, title, description]) => (
            <button
              key={value}
              type="button"
              onClick={() => setDraft({ ...draft, signTheme: value })}
              className={`rounded-lg px-4 py-3 text-left ring-1 ${draft.signTheme === value ? 'bg-brand-50 ring-2 ring-brand-600' : 'bg-white ring-slate-300 hover:bg-slate-50'}`}
            >
              <span className="block text-sm font-semibold text-slate-900">{title}</span>
              <span className="mt-0.5 block text-xs text-slate-600">{description}</span>
            </button>
          ))}
        </div>
        {draft.signTheme === 'auto' && (
          <Field label="Colori scuri" error={errors.get('darkFrom') ?? errors.get('darkUntil')}>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              dalle
              <input type="time" className={`${inputClass} w-32!`} value={draft.darkFrom} onChange={(e) => setDraft({ ...draft, darkFrom: e.target.value })} />
              alle
              <input type="time" className={`${inputClass} w-32!`} value={draft.darkUntil} onChange={(e) => setDraft({ ...draft, darkUntil: e.target.value })} />
            </div>
          </Field>
        )}
      </Card>

      <Card className="space-y-6 p-5">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Programma: cambio sala</h2>
          <p className="mt-1 text-sm text-slate-600">
            Orario a cui le sale passano da un evento all’altro. Per i nuovi eventi la preparazione parte a quest’ora del
            giorno prima e il riordino finisce a quest’ora dopo la fine. Gli eventi già salvati non cambiano.
          </p>
        </div>
        <Field label="Orario di cambio sala" error={errors.get('changeoverTime')}>
          <input
            type="time"
            className={`${inputClass} w-32!`}
            value={draft.changeoverTime}
            onChange={(e) => setDraft({ ...draft, changeoverTime: e.target.value })}
          />
        </Field>
      </Card>

        {save.isError && <ErrorNote>{errorMessage(save.error)}</ErrorNote>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setDraft(DEFAULT_SETTINGS)}>
            Valori predefiniti
          </Button>
          <Button variant="primary" disabled={!changed || !result.success} busy={save.isPending} onClick={() => save.mutate()}>
            Salva
          </Button>
        </div>
    </div>
  );
}

/** Venue settings, for the superadmin. */
export default function Settings() {
  const settings = useSettings();
  if (settings.isPending) return <PageLoading />;
  if (settings.isError) return <ErrorNote>{errorMessage(settings.error)}</ErrorNote>;
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Impostazioni</h1>
      <SettingsForm key={JSON.stringify(settings.data)} saved={settings.data} />
    </div>
  );
}
