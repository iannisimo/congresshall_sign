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
    visible: z.boolean(),
  })
  .refine((e) => e.prepAt <= e.startAt, {
    path: ['prepAt'],
    error: "La preparazione non può iniziare dopo l'inizio dell'evento",
  })
  .refine((e) => e.startAt < e.endAt, { path: ['endAt'], error: "La fine deve essere dopo l'inizio" })
  .refine((e) => e.endAt <= e.releaseAt, {
    path: ['releaseAt'],
    error: "La sala non può liberarsi prima della fine dell'evento",
  });
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

export const logoUrlSchema = z.object({ url: z.url({ protocol: /^https?$/, error: 'Indirizzo non valido' }) });

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

export const settingsSchema = z.object({
  marqueeSpeed: z
    .number()
    .int({ error: 'Usa un numero intero' })
    .min(10, { error: 'Minimo 10 pixel al secondo' })
    .max(400, { error: 'Massimo 400 pixel al secondo' }),
  marqueePause: z.number().min(0, { error: 'Non può essere negativa' }).max(30, { error: 'Massimo 30 secondi' }),
  changeoverTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Orario non valido' }),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});
