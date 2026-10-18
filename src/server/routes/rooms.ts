import { Hono } from 'hono';
import { overrideInputSchema, roomInputSchema, roomOrderSchema, type RoomInput } from '../../shared/schemas.ts';
import { requireRole } from '../auth/session.ts';
import type { Db } from '../db/database.ts';
import { deleteOverride, setOverride } from '../data/overrides.ts';
import {
  countChildren,
  countUpcomingBookings,
  createRoom,
  deleteRoom,
  getRoom,
  listRooms,
  reorderRooms,
  updateRoom,
} from '../data/rooms.ts';
import { ApiError, idParam, notFound, readJson, type AppDeps, type AppEnv } from '../http.ts';

function checkParents(db: Db, input: RoomInput, id?: number): void {
  const rooms = new Map(listRooms(db).map((room) => [room.id, room]));
  for (const parentId of input.parentIds) {
    const parent = rooms.get(parentId);
    if (!parent || parentId === id) throw new ApiError(400, 'Sala principale non valida');
    if (parent.kind !== 'main') throw new ApiError(400, `${parent.name} non è una sala principale`);
  }
}

export function roomRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const { db } = deps;
  app.use('*', requireRole('admin'));

  app.get('/', (c) => c.json(listRooms(db)));

  app.post('/', requireRole('superadmin'), async (c) => {
    const input = await readJson(c, roomInputSchema);
    checkParents(db, input);
    return c.json(getRoom(db, createRoom(db, input)), 201);
  });

  app.put('/order', requireRole('superadmin'), async (c) => {
    const { ids } = await readJson(c, roomOrderSchema);
    const existing = listRooms(db).map((room) => room.id);
    if (ids.length !== existing.length || !existing.every((id) => ids.includes(id))) {
      throw new ApiError(400, 'L’ordine deve contenere tutte le sale');
    }
    reorderRooms(db, ids);
    return c.json(listRooms(db));
  });

  app.put('/:id', requireRole('superadmin'), async (c) => {
    const id = idParam(c);
    const input = await readJson(c, roomInputSchema);
    const room = getRoom(db, id);
    if (!room) throw notFound();
    checkParents(db, input, id);
    if (input.kind === 'sub' && room.kind === 'main') {
      if (countUpcomingBookings(db, id, deps.clock()) > 0) {
        throw new ApiError(409, 'Ha eventi in programma: non può diventare una sottosala');
      }
      if (countChildren(db, id) > 0) throw new ApiError(409, 'Ha delle sottosale: non può diventare una sottosala');
    }
    updateRoom(db, id, input);
    return c.json(getRoom(db, id));
  });

  app.delete('/:id', requireRole('superadmin'), (c) => {
    const id = idParam(c);
    if (!getRoom(db, id)) throw notFound();
    const upcoming = countUpcomingBookings(db, id, deps.clock());
    if (upcoming > 0) throw new ApiError(409, `Non eliminabile: ${upcoming} eventi in programma la usano`);
    deleteRoom(db, id);
    return c.body(null, 204);
  });

  app.put('/:id/override', async (c) => {
    const roomId = idParam(c);
    const input = await readJson(c, overrideInputSchema);
    if (!getRoom(db, roomId)) throw notFound();
    const now = deps.clock();
    if (input.until.kind === 'time' && input.until.at <= now) throw new ApiError(400, 'L’orario di fine è già passato');
    setOverride(db, {
      roomId,
      status: input.status,
      message: input.message,
      createdAt: now,
      expiresAt: input.until.kind === 'time' ? input.until.at : null,
      untilNextChange: input.until.kind === 'next-change',
    });
    return c.body(null, 204);
  });

  app.delete('/:id/override', (c) => {
    deleteOverride(db, idParam(c));
    return c.body(null, 204);
  });

  return app;
}
