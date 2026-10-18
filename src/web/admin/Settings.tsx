import { useMutation } from '@tanstack/react-query';
import { startOfDay } from 'date-fns';
import { useState } from 'react';
import type { ScheduledEvent, SignSettings } from '../../shared/model.ts';
import { signSettingsSchema } from '../../shared/schemas.ts';
import { DEFAULT_SIGN_SETTINGS } from '../../shared/settings.ts';
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

function SettingsForm({ saved }: { saved: SignSettings }) {
  const { toast } = useFeedback();
  const [draft, setDraft] = useState(saved);
  const [sample] = useState(sampleEvent);

  const result = signSettingsSchema.safeParse(draft);
  const errors = new Map(result.error?.issues.map((issue) => [String(issue.path[0]), issue.message]) ?? []);
  const changed = draft.marqueeSpeed !== saved.marqueeSpeed || draft.marqueePause !== saved.marqueePause;

  const save = useMutation({
    mutationFn: () => api<SignSettings>('/settings', { method: 'PUT', json: draft }),
    onSuccess: (settings) => {
      queryClient.setQueryData(keys.settings, settings);
      void queryClient.invalidateQueries({ queryKey: keys.display });
      toast('Impostazioni salvate: il cartello le applica entro un minuto');
    },
  });

  return (
    <Card className="space-y-6 p-5">
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Testi lunghi</h2>
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

      {save.isError && <ErrorNote>{errorMessage(save.error)}</ErrorNote>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => setDraft(DEFAULT_SIGN_SETTINGS)}>
          Valori predefiniti
        </Button>
        <Button variant="primary" disabled={!changed || !result.success} busy={save.isPending} onClick={() => save.mutate()}>
          Salva
        </Button>
      </div>
    </Card>
  );
}

/** Sign settings, for the superadmin. */
export default function Settings() {
  const settings = useSettings();
  if (settings.isPending) return <PageLoading />;
  if (settings.isError) return <ErrorNote>{errorMessage(settings.error)}</ErrorNote>;
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Impostazioni del cartello</h1>
      <SettingsForm key={JSON.stringify(settings.data)} saved={settings.data} />
    </div>
  );
}
