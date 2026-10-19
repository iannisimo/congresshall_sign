import { Hono } from 'hono';
import { findConflicts } from '../../shared/conflicts.ts';
import { flattenEvents } from '../../shared/events.ts';
import type { Conflict } from '../../shared/model.ts';
import { createEventSchema, eventRangeSchema, updateEventSchema, type EventInput } from '../../shared/schemas.ts';
import { requireRole } from '../auth/session.ts';
import { transaction, type Db } from '../db/database.ts';
import { deleteEvent, getEvent, insertEvent, listEvents, updateEvent } from '../data/events.ts';
import { getOrganizer, logoOwner } from '../data/organizers.ts';
import { listRooms } from '../data/rooms.ts';
import { ApiError, idParam, notFound, parse, readJson, type AppDeps, type AppEnv } from '../http.ts';

function checkReferences(db: Db, input: EventInput): void {
  if (!getOrganizer(db, input.organizerId)) throw new ApiError(400, 'Organizzatore inesistente');
  if (input.logoId !== null && logoOwner(db, input.logoId) !== input.organizerId) {
    throw new ApiError(400, 'Il logo non appartiene a questo organizzatore');
  }
  const rooms = new Map(listRooms(db).map((room) => [room.id, room]));
  for (const booking of input.days.flatMap((day) => day.bookings)) {
    for (const roomId of booking.roomIds) {
      const room = rooms.get(roomId);
      if (!room) throw new ApiError(400, 'Sala inesistente');
      if (room.kind !== 'main') throw new ApiError(400, `${room.name} è una sottosala e non si può prenotare`);
    }
  }
}

/**
 * Conflicts of each booking with the bookings of other events. Bookings of the same event are checked by
 * the schema.
 */
function findAllConflicts(db: Db, eventId: number | undefined, input: EventInput) {
  const bookings = input.days.flatMap((day) => day.bookings);
  if (bookings.length === 0) return [];
  const from = Math.min(...bookings.map((b) => b.startAt));
  const to = Math.max(...bookings.map((b) => b.endAt));
  const others = flattenEvents(listEvents(db, { from, to }));
  const found: { date: string; bookingIndex: number; conflicts: Conflict[] }[] = [];
  for (const day of input.days) {
    day.bookings.forEach((booking, bookingIndex) => {
      const conflicts = findConflicts({ eventId, ...booking }, others);
      if (conflicts.length > 0) found.push({ date: day.date, bookingIndex, conflicts });
    });
  }
  return found;
}

function rejectConflicts(db: Db, eventId: number | undefined, input: EventInput): void {
  const conflicts = findAllConflicts(db, eventId, input);
  if (conflicts.length > 0) throw new ApiError(409, 'Sovrapposizione con altri eventi nelle stesse sale', { conflicts });
}

export function eventRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const { db } = deps;
  app.use('*', requireRole('admin', 'superadmin'));

  app.get('/', (c) => {
    const range = parse(eventRangeSchema, c.req.query());
    return c.json(listEvents(db, range));
  });

  app.get('/:id', (c) => {
    const event = getEvent(db, idParam(c));
    if (!event) throw notFound();
    return c.json(event);
  });

  app.post('/', async (c) => {
    const { event: input, allowConflicts } = await readJson(c, createEventSchema);
    checkReferences(db, input);
    if (!allowConflicts) rejectConflicts(db, undefined, input);
    const id = transaction(db, () => insertEvent(db, input, deps.clock()));
    return c.json({ id }, 201);
  });

  app.put('/:id', async (c) => {
    const id = idParam(c);
    const { event: input, allowConflicts } = await readJson(c, updateEventSchema);
    if (!getEvent(db, id)) throw notFound();
    checkReferences(db, input);
    if (!allowConflicts) rejectConflicts(db, id, input);
    transaction(db, () => updateEvent(db, id, input, deps.clock()));
    return c.json(getEvent(db, id));
  });

  app.delete('/:id', (c) => {
    if (!deleteEvent(db, idParam(c))) throw notFound();
    return c.body(null, 204);
  });

  return app;
}
