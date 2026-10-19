import { z } from 'zod';

// Inputs accepted by the API, checked with the same rules in the admin form and on the server.
// Messages are in Italian because only the admin area shows them.

const id = z.number().int().positive();
const time = z.number().int().nonnegative();

/** Trimmed text where an empty string means "none". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Massimo ${max} caratteri` })
    .nullable()
    .transform((v) => v || null);

const unique = (ids: number[]) => new Set(ids).size === ids.length;

export const eventInputSchema = z
  .object({
    organizerId: id,
    logoId: id.nullable(),
    title: z.string().trim().min(1, { error: 'Inserisci un titolo' }).max(200, { error: 'Massimo 200 caratteri' }),
    subtitle: optionalText(300),
    roomIds: z.array(id).min(1, { error: 'Scegli almeno una sala' }).max(50).refine(unique, { error: 'Sala ripetuta' }),
    prepAt: time,
    startAt: time,
    endAt: time,
    releaseAt: time,
    breaks: z
      .array(
        z
          .object({
            label: z.string().trim().min(1, { error: 'Dai un nome alla pausa' }).max(40, { error: 'Massimo 40 caratteri' }),
            startAt: time,
            endAt: time,
          })
          .refine((b) => b.startAt < b.endAt, { error: 'La pausa deve finire dopo il suo inizio' }),
      )
      .max(20)
      .default([]),
    visible: z.boolean(),
    receptionNotes: optionalText(4000).default(null),
    housekeepingNotes: optionalText(4000).default(null),
  })
  .refine((e) => e.prepAt <= e.startAt, {
    path: ['prepAt'],
    error: "La preparazione non può iniziare dopo l'inizio dell'evento",
  })
  .refine((e) => e.startAt < e.endAt, { path: ['endAt'], error: "La fine deve essere dopo l'inizio" })
  .refine((e) => e.endAt <= e.releaseAt, {
    path: ['releaseAt'],
    error: "La sala non può liberarsi prima della fine dell'evento",
  })
  .refine((e) => e.breaks.every((b) => b.startAt >= e.startAt && b.endAt <= e.endAt), {
    path: ['breaks'],
    error: "Le pause devono stare dentro l'orario dell'evento",
  })
  .refine(
    (e) => [...e.breaks].sort((a, b) => a.startAt - b.startAt).every((b, i, list) => i === 0 || list[i - 1]!.endAt <= b.startAt),
    { path: ['breaks'], error: 'Le pause non possono sovrapporsi' },
  );
export type EventInput = z.output<typeof eventInputSchema>;

export const createEventsSchema = z.object({
  events: z.array(eventInputSchema).min(1).max(60),
  allowConflicts: z.boolean().optional(),
});

export const updateEventSchema = z.object({
  event: eventInputSchema,
  allowConflicts: z.boolean().optional(),
});

export const eventRangeSchema = z
  .object({ from: z.coerce.number().int(), to: z.coerce.number().int() })
  .refine((r) => r.from < r.to, { error: 'Intervallo non valido' });

export const organizerInputSchema = z.object({
  name: z.string().trim().min(1, { error: 'Inserisci un nome' }).max(120, { error: 'Massimo 120 caratteri' }),
});

/** A logo from a URL the server downloads, or a copy of a generic emblem. */
/**
 * Square part of an uploaded image to keep, as fractions of its width (`left`, `size`) and height (`top`).
 * It may reach past the image: that space stays transparent.
 */
export const logoCropSchema = z.object({
  left: z.number().min(-20).max(20),
  top: z.number().min(-20).max(20),
  size: z.number().positive().max(20),
});
export type LogoCrop = z.infer<typeof logoCropSchema>;

export const logoSourceSchema = z.union([
  z.object({ url: z.url({ protocol: /^https?$/, error: 'Indirizzo non valido' }), crop: logoCropSchema.optional() }),
  z.object({ generic: z.string().regex(/^[a-z-]+$/) }),
]);

export const roomInputSchema = z
  .object({
    name: z.string().trim().min(1, { error: 'Inserisci un nome' }).max(80, { error: 'Massimo 80 caratteri' }),
    kind: z.enum(['main', 'sub']),
    parentIds: z.array(id).max(50).refine(unique, { error: 'Sala ripetuta' }),
    blockedMessage: optionalText(120),
  })
  .refine((r) => r.kind === 'sub' || r.parentIds.length === 0, {
    path: ['parentIds'],
    error: 'Solo le sottosale hanno sale principali',
  });
export type RoomInput = z.output<typeof roomInputSchema>;

export const roomOrderSchema = z.object({ ids: z.array(id).refine(unique) });

export const overrideInputSchema = z.object({
  status: z.enum(['free', 'occupied', 'reserved']),
  message: optionalText(80),
  until: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('next-change') }),
    z.object({ kind: z.literal('time'), at: time }),
    z.object({ kind: z.literal('manual') }),
  ]),
});
export type OverrideInput = z.input<typeof overrideInputSchema>;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: 'Colore non valido (#rrggbb)' });
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Orario non valido' });

export const settingsSchema = z.object({
  marqueeSpeed: z
    .number()
    .int({ error: 'Usa un numero intero' })
    .min(10, { error: 'Minimo 10 pixel al secondo' })
    .max(400, { error: 'Massimo 400 pixel al secondo' }),
  marqueeVerticalSpeed: z
    .number()
    .int({ error: 'Usa un numero intero' })
    .min(2, { error: 'Minimo 2 pixel al secondo' })
    .max(200, { error: 'Massimo 200 pixel al secondo' }),
  marqueePause: z.number().min(0, { error: 'Non può essere negativa' }).max(30, { error: 'Massimo 30 secondi' }),
  prepTime: clockTime,
  cleanupTime: clockTime,
  cleanupMinGapHours: z.number().min(0, { error: 'Non può essere negativo' }).max(12, { error: 'Massimo 12 ore' }),
  signTheme: z.enum(['auto', 'light', 'dark']),
  darkFrom: clockTime,
  darkUntil: clockTime,
  staleAfterMinutes: z.number().int({ error: 'Usa un numero intero' }).min(2, { error: 'Minimo 2 minuti' }).max(1440, { error: 'Massimo 1440 minuti' }),
  offlineAfterHours: z.number().int({ error: 'Usa un numero intero' }).min(1, { error: 'Minimo 1 ora' }).max(720, { error: 'Massimo 720 ore' }),
  carouselImageSeconds: z.number().int({ error: 'Usa un numero intero' }).min(2, { error: 'Minimo 2 secondi' }).max(600, { error: 'Massimo 600 secondi' }),
  nightClock: z.boolean(),
  carouselFit: z.enum(['contain', 'fill', 'cover']),
  brandColor: hexColor,
  freeColor: hexColor,
  occupiedColor: hexColor,
  reservedColor: hexColor,
});

/** The part of the settings the media account can change. */
export const carouselSettingsSchema = settingsSchema.pick({ carouselImageSeconds: true, carouselFit: true });

const mediaFit = z.enum(['contain', 'fill', 'cover']);
const presetName = z.string().regex(/^[a-z0-9-]{1,40}$/, { error: 'Usa da 1 a 40 lettere minuscole, cifre o trattini' });
const presetLabel = z.string().trim().min(1, { error: 'Scrivi un nome' }).max(60, { error: 'Massimo 60 caratteri' });

export const mediaPresetCreateSchema = z.object({
  name: presetName,
  label: presetLabel,
  copyFrom: z.number().int().positive().optional(),
});

export const mediaPresetPatchSchema = z.object({
  name: presetName.optional(),
  label: presetLabel.optional(),
  imageSeconds: z.number().int({ error: 'Usa un numero intero' }).min(2, { error: 'Minimo 2 secondi' }).max(600, { error: 'Massimo 600 secondi' }).nullable().optional(),
  fit: mediaFit.nullable().optional(),
});

/** The whole ordered list of a preset's items. */
export const mediaPresetItemsSchema = z.object({
  items: z
    .array(z.object({ mediaId: z.number().int().positive(), enabled: z.boolean(), fit: mediaFit.nullable() }))
    .max(500)
    .refine((items) => new Set(items.map((i) => i.mediaId)).size === items.length, { error: 'File ripetuto' }),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});
