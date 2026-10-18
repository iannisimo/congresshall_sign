import { Hono } from 'hono';
import { findConflicts } from '../../shared/conflicts.ts';
import type { ScheduledEvent } from '../../shared/model.ts';
import { createEventsSchema, eventRangeSchema, updateEventSchema, type EventInput } from '../../shared/schemas.ts';
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
  for (const roomId of input.roomIds) {
    const room = rooms.get(roomId);
    if (!room) throw new ApiError(400, 'Sala inesistente');
    if (room.kind !== 'main') throw new ApiError(400, `${room.name} è una sottosala e non si può prenotare`);
  }
}

/** Conflicts of each event with saved events and with the ones before it in the same request. */
function findAllConflicts(db: Db, items: { id?: number; input: EventInput }[]) {
  const from = Math.min(...items.map((i) => i.input.prepAt));
  const to = Math.max(...items.map((i) => i.input.releaseAt));
  const others: ScheduledEvent[] = listEvents(db, { from, to });
  const found = [];
  for (const [index, { id, input }] of items.entries()) {
    const conflicts = findConflicts({ id, ...input }, others);
    if (conflicts.length > 0) found.push({ index, conflicts });
    others.push({ ...input, id: -(index + 1), organizerName: '' });
  }
  return found;
}

function rejectConflicts(db: Db, items: { id?: number; input: EventInput }[]): void {
  const conflicts = findAllConflicts(db, items);
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

  /** Creates one or more events at once, e.g. the same session on each day of a congress. */
  app.post('/', async (c) => {
    const { events, allowConflicts } = await readJson(c, createEventsSchema);
    events.forEach((input) => checkReferences(db, input));
    if (!allowConflicts) rejectConflicts(db, events.map((input) => ({ input })));
    const now = deps.clock();
    const ids = transaction(db, () => events.map((input) => insertEvent(db, input, now)));
    return c.json({ ids }, 201);
  });

  app.put('/:id', async (c) => {
    const id = idParam(c);
    const { event: input, allowConflicts } = await readJson(c, updateEventSchema);
    if (!getEvent(db, id)) throw notFound();
    checkReferences(db, input);
    if (!allowConflicts) rejectConflicts(db, [{ id, input }]);
    transaction(db, () => updateEvent(db, id, input, deps.clock()));
    return c.json(getEvent(db, id));
  });

  app.delete('/:id', (c) => {
    if (!deleteEvent(db, idParam(c))) throw notFound();
    return c.body(null, 204);
  });

  return app;
}
