import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DisplaySnapshot, Organizer, Room, ScheduledEvent } from '../shared/model.ts';
import { changeoverMargins, DAY, HOUR, MINUTE } from '../shared/time.ts';
import { createApp } from './app.ts';
import { hashPassword } from './auth/password.ts';
import { loadConfig } from './config.ts';
import { openDatabase } from './db/database.ts';
import { setPassword } from './data/users.ts';

const PASSWORD = 'correct horse';
let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

/** A fresh app on an in-memory database, with a clock the test controls. */
function setup() {
  const clock = { now: new Date('2026-10-17T08:00:00+02:00').getTime() };
  const db = openDatabase(':memory:');
  setPassword(db, 'admin', passwordHash, clock.now);
  setPassword(db, 'superadmin', passwordHash, clock.now);
  // Uploaded media go to a throwaway folder.
  const dataDir = mkdtempSync(join(tmpdir(), 'sign-test-'));
  const app = createApp({ db, config: loadConfig({ DATA_DIR: dataDir }), version: 'test', clock: () => clock.now });

  /** A browser-like client that keeps its session cookie. */
  function client() {
    let cookie = '';
    async function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
      const init: RequestInit = { method, headers: { ...headers, ...(cookie ? { cookie } : {}) } };
      if (body instanceof FormData) init.body = body;
      else if (body !== undefined) {
        init.body = JSON.stringify(body);
        (init.headers as Record<string, string>)['content-type'] = 'application/json';
      }
      const res = await app.request(path, init);
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0]!;
      return res;
    }
    return {
      req,
      cookie: () => cookie,
      async login(username = 'admin') {
        const res = await req('POST', '/api/auth/login', { username, password: PASSWORD });
        expect(res.status).toBe(200);
      },
    };
  }

  return { db, app, clock, client };
}

type Setup = ReturnType<typeof setup>;

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/** Superadmin creates rooms A and B (main) and A1 (sub of A); admin creates an organizer. */
async function seed(t: Setup) {
  const superadmin = t.client();
  await superadmin.login('superadmin');
  const a = await json<Room>(await superadmin.req('POST', '/api/rooms', { name: 'Sala A', kind: 'main', parentIds: [], blockedMessage: null }));
  const b = await json<Room>(await superadmin.req('POST', '/api/rooms', { name: 'Sala B', kind: 'main', parentIds: [], blockedMessage: null }));
  const a1 = await json<Room>(
    await superadmin.req('POST', '/api/rooms', { name: 'Sala A1', kind: 'sub', parentIds: [a.id], blockedMessage: 'Riservata' }),
  );
  const admin = t.client();
  await admin.login();
  const org = await json<Organizer>(await admin.req('POST', '/api/organizers', { name: 'Unipi' }));
  return { superadmin, admin, rooms: { a, b, a1 }, org };
}

function eventInput(t: Setup, organizerId: number, roomIds: number[], startInHours: number, durationHours = 2) {
  const startAt = t.clock.now + startInHours * HOUR;
  const endAt = startAt + durationHours * HOUR;
  return {
    organizerId,
    logoId: null,
    title: 'Convegno',
    subtitle: '',
    roomIds,
    prepAt: startAt - 30 * MINUTE,
    startAt,
    endAt,
    releaseAt: endAt + 30 * MINUTE,
    visible: true,
  };
}

describe('auth', () => {
  it('logs in, reports the user and logs out', async () => {
    const t = setup();
    const c = t.client();
    expect((await c.req('GET', '/api/auth/me')).status).toBe(401);
    await c.login();
    expect(c.cookie()).toMatch(/^cs_session=/);
    expect(await json(await c.req('GET', '/api/auth/me'))).toEqual({ username: 'admin', role: 'admin' });
    expect((await c.req('POST', '/api/auth/logout')).status).toBe(204);
    expect((await c.req('GET', '/api/auth/me')).status).toBe(401);
  });

  it('rejects wrong passwords and locks out after repeated failures', async () => {
    const t = setup();
    const c = t.client();
    for (let i = 0; i < 5; i++) {
      expect((await c.req('POST', '/api/auth/login', { username: 'admin', password: 'nope' })).status).toBe(401);
    }
    expect((await c.req('POST', '/api/auth/login', { username: 'admin', password: PASSWORD })).status).toBe(429);
    t.clock.now += 16 * MINUTE;
    expect((await c.req('POST', '/api/auth/login', { username: 'admin', password: PASSWORD })).status).toBe(200);
  });

  it('renews the session while in use and expires it when idle', async () => {
    const t = setup();
    const c = t.client();
    await c.login();
    const first = c.cookie();
    t.clock.now += 2 * DAY;
    expect((await c.req('GET', '/api/auth/me')).status).toBe(200);
    expect(c.cookie()).toBe(first); // same token, new expiry
    t.clock.now += 29 * DAY;
    expect((await c.req('GET', '/api/auth/me')).status).toBe(200);
    t.clock.now += 31 * DAY;
    expect((await c.req('GET', '/api/auth/me')).status).toBe(401);
  });

  it('logs out everywhere when the password changes', async () => {
    const t = setup();
    const c = t.client();
    await c.login();
    setPassword(t.db, 'admin', passwordHash, t.clock.now);
    expect((await c.req('GET', '/api/auth/me')).status).toBe(401);
  });

  it('rejects changes coming from other sites', async () => {
    const t = setup();
    const c = t.client();
    await c.login();
    const res = await c.req('POST', '/api/organizers', { name: 'X' }, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    const ok = await c.req('POST', '/api/organizers', { name: 'X' }, { origin: 'http://localhost' });
    expect(ok.status).toBe(201);
  });
});

describe('rooms', () => {
  it('can only be managed by the superadmin', async () => {
    const t = setup();
    const admin = t.client();
    await admin.login();
    expect((await admin.req('POST', '/api/rooms', { name: 'X', kind: 'main', parentIds: [], blockedMessage: null })).status).toBe(403);
    expect((await admin.req('GET', '/api/rooms')).status).toBe(200);
  });

  it('keeps parents and order', async () => {
    const t = setup();
    const { superadmin, rooms } = await seed(t);
    expect(rooms.a1).toMatchObject({ kind: 'sub', parentIds: [rooms.a.id], blockedMessage: 'Riservata' });
    const order = [rooms.a1.id, rooms.b.id, rooms.a.id];
    const reordered = await json<Room[]>(await superadmin.req('PUT', '/api/rooms/order', { ids: order }));
    expect(reordered.map((r) => r.id)).toEqual(order);
  });

  it('refuses to delete a room with upcoming events, and allows it once they are over', async () => {
    const t = setup();
    const { superadmin, admin, rooms, org } = await seed(t);
    await admin.req('POST', '/api/events', { events: [eventInput(t, org.id, [rooms.b.id], 1)] });
    expect((await superadmin.req('DELETE', `/api/rooms/${rooms.b.id}`)).status).toBe(409);
    t.clock.now += DAY;
    expect((await superadmin.req('DELETE', `/api/rooms/${rooms.b.id}`)).status).toBe(204);
  });
});

describe('events', () => {
  it('creates, edits in place and deletes', async () => {
    const t = setup();
    const { admin, rooms, org } = await seed(t);
    const created = await admin.req('POST', '/api/events', { events: [eventInput(t, org.id, [rooms.a.id], 1)] });
    expect(created.status).toBe(201);
    const [id] = (await json<{ ids: number[] }>(created)).ids;

    const edited = { ...eventInput(t, org.id, [rooms.b.id, rooms.a.id], 2), title: 'Nuovo titolo' };
    const updated = await json<ScheduledEvent>(await admin.req('PUT', `/api/events/${id}`, { event: edited }));
    expect(updated).toMatchObject({ id, title: 'Nuovo titolo', roomIds: [rooms.b.id, rooms.a.id], organizerName: 'Unipi', subtitle: null });

    expect((await admin.req('DELETE', `/api/events/${id}`)).status).toBe(204);
    expect((await admin.req('GET', `/api/events/${id}`)).status).toBe(404);
  });

  it('keeps breaks with the event', async () => {
    const t = setup();
    const { admin, rooms, org } = await seed(t);
    const input = eventInput(t, org.id, [rooms.a.id], 1, 4);
    const lunch = { label: 'Lunch break', startAt: input.startAt + 2 * HOUR, endAt: input.startAt + 3 * HOUR };
    const coffee = { label: 'Coffee break', startAt: input.startAt + HOUR, endAt: input.startAt + 1.5 * HOUR };
    const [id] = (await json<{ ids: number[] }>(await admin.req('POST', '/api/events', { events: [{ ...input, breaks: [lunch, coffee] }] }))).ids;
    expect((await json<ScheduledEvent>(await admin.req('GET', `/api/events/${id}`))).breaks).toEqual([coffee, lunch]);
    await admin.req('PUT', `/api/events/${id}`, { event: { ...input, breaks: [lunch] } });
    const snapshot = await json<DisplaySnapshot>(await t.app.request('/api/display'));
    expect(snapshot.events[0]!.breaks).toEqual([lunch]);
  });

  it('validates times and references', async () => {
    const t = setup();
    const { admin, rooms, org } = await seed(t);
    const bad = { ...eventInput(t, org.id, [rooms.a.id], 1), endAt: t.clock.now };
    const res = await admin.req('POST', '/api/events', { events: [bad] });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ issues: [{ path: 'events.0.endAt' }] });

    const subRoom = await admin.req('POST', '/api/events', { events: [eventInput(t, org.id, [rooms.a1.id], 1)] });
    expect(subRoom.status).toBe(400);
  });

  it('reports conflicts unless told to save anyway', async () => {
    const t = setup();
    const { admin, rooms, org } = await seed(t);
    await admin.req('POST', '/api/events', { events: [eventInput(t, org.id, [rooms.a.id], 1)] });

    const clash = eventInput(t, org.id, [rooms.a.id, rooms.b.id], 2);
    const res = await admin.req('POST', '/api/events', { events: [clash] });
    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ conflicts: [{ index: 0, conflicts: [{ roomIds: [rooms.a.id] }] }] });

    expect((await admin.req('POST', '/api/events', { events: [clash], allowConflicts: true })).status).toBe(201);
  });

  it('lets the days of a congress hold the room in between without conflicts', async () => {
    const t = setup();
    const { admin, rooms, org } = await seed(t);
    const days = [24, 48].map((h) => {
      const input = eventInput(t, org.id, [rooms.a.id], h, 9);
      return { ...input, ...changeoverMargins(input.startAt, input.endAt, '14:00') };
    });
    // Day 1 is cleaned up until 14:00 of day 2, day 2 is prepared from 14:00 of day 1: no conflict.
    expect((await admin.req('POST', '/api/events', { events: days })).status).toBe(201);
    // Another event during day 2 is a conflict.
    expect((await admin.req('POST', '/api/events', { events: [eventInput(t, org.id, [rooms.a.id], 50)] })).status).toBe(409);
  });

  it('creates the same event on several days at once', async () => {
    const t = setup();
    const { admin, rooms, org } = await seed(t);
    const days = [0, 1, 2].map((d) => eventInput(t, org.id, [rooms.a.id], 1 + d * 24));
    const res = await admin.req('POST', '/api/events', { events: days });
    expect((await json<{ ids: number[] }>(res)).ids).toHaveLength(3);
    const listed = await json<ScheduledEvent[]>(
      await admin.req('GET', `/api/events?from=${t.clock.now}&to=${t.clock.now + 4 * DAY}`),
    );
    expect(listed).toHaveLength(3);
  });
});

describe('organizers and logos', () => {
  async function png(width: number, height: number) {
    return sharp({ create: { width, height, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  }

  it('returns the existing organizer for a duplicate name, and refuses clashing renames', async () => {
    const t = setup();
    const { admin, org } = await seed(t);
    const again = await admin.req('POST', '/api/organizers', { name: 'UNIPI' });
    expect(again.status).toBe(200);
    expect((await json<Organizer>(again)).id).toBe(org.id);
    const other = await json<Organizer>(await admin.req('POST', '/api/organizers', { name: 'CNR' }));
    expect((await admin.req('PATCH', `/api/organizers/${other.id}`, { name: 'unipi' })).status).toBe(409);
    expect((await admin.req('PATCH', `/api/organizers/${other.id}`, { name: 'C.N.R.' })).status).toBe(200);
  });

  it('shrinks uploads to PNG and serves them publicly; logos in use cannot be deleted', async () => {
    const t = setup();
    const { admin, rooms, org } = await seed(t);
    const form = new FormData();
    form.append('file', new Blob([await png(1600, 800)], { type: 'image/png' }), 'logo.png');
    const upload = await admin.req('POST', `/api/organizers/${org.id}/logos`, form);
    expect(upload.status).toBe(201);
    const { id } = await json<{ id: number }>(upload);

    const image = await t.app.request(`/api/logos/${id}`);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(image.headers.get('cache-control')).toContain('immutable');
    const meta = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([512, 256]);

    await admin.req('POST', '/api/events', { events: [{ ...eventInput(t, org.id, [rooms.a.id], 1), logoId: id }] });
    expect((await admin.req('DELETE', `/api/logos/${id}`)).status).toBe(409);
    expect((await admin.req('DELETE', `/api/organizers/${org.id}`)).status).toBe(409);
  });

  it('rejects files that are not images', async () => {
    const t = setup();
    const { admin, org } = await seed(t);
    const form = new FormData();
    form.append('file', new Blob(['hello'], { type: 'text/plain' }), 'x.txt');
    expect((await admin.req('POST', `/api/organizers/${org.id}/logos`, form)).status).toBe(400);
  });
});

describe('display', () => {
  it('serves a snapshot with an ETag and answers 304 when nothing changed', async () => {
    const t = setup();
    const { admin, rooms, org } = await seed(t);
    await admin.req('POST', '/api/events', {
      events: [eventInput(t, org.id, [rooms.a.id], 1), { ...eventInput(t, org.id, [rooms.b.id], 3), visible: false }],
    });

    const res = await t.app.request('/api/display');
    expect(res.status).toBe(200);
    const snapshot = await json<DisplaySnapshot>(res);
    expect(snapshot).toMatchObject({ version: 'test' });
    expect(snapshot.rooms.map((r) => r.name)).toEqual(['Sala A', 'Sala B', 'Sala A1']);
    expect(snapshot.events.map((e) => e.roomIds)).toEqual([[rooms.a.id]]); // hidden event left out

    const etag = res.headers.get('etag')!;
    expect((await t.app.request('/api/display', { headers: { 'if-none-match': etag } })).status).toBe(304);
    expect((await t.app.request('/api/display', { headers: { 'if-none-match': `W/${etag}` } })).status).toBe(304);

    await admin.req('DELETE', `/api/events/${snapshot.events[0]!.id}`);
    expect((await t.app.request('/api/display', { headers: { 'if-none-match': etag } })).status).toBe(200);
  });

  it('includes overrides only while they apply', async () => {
    const t = setup();
    const { admin, rooms } = await seed(t);
    const until = t.clock.now + HOUR;
    const set = await admin.req('PUT', `/api/rooms/${rooms.b.id}/override`, {
      status: 'reserved',
      message: 'Lavori',
      until: { kind: 'time', at: until },
    });
    expect(set.status).toBe(204);
    const before = await json<DisplaySnapshot>(await t.app.request('/api/display'));
    expect(before.overrides).toMatchObject([{ roomId: rooms.b.id, message: 'Lavori', expiresAt: until }]);

    t.clock.now = until;
    const after = await json<DisplaySnapshot>(await t.app.request('/api/display'));
    expect(after.overrides).toEqual([]);
  });

  it('ends "until next change" overrides when the schedule moves on', async () => {
    const t = setup();
    const { admin, rooms, org } = await seed(t);
    await admin.req('POST', '/api/events', { events: [eventInput(t, org.id, [rooms.a.id], 1)] });
    await admin.req('PUT', `/api/rooms/${rooms.a.id}/override`, { status: 'reserved', message: null, until: { kind: 'next-change' } });
    expect((await json<DisplaySnapshot>(await t.app.request('/api/display'))).overrides).toHaveLength(1);
    t.clock.now += 31 * MINUTE; // preparation started
    expect((await json<DisplaySnapshot>(await t.app.request('/api/display'))).overrides).toEqual([]);
  });
});

describe('settings', () => {
  it('start from the defaults, only the superadmin changes them, and the sign gets them', async () => {
    const t = setup();
    const admin = t.client();
    await admin.login();
    expect(await json(await admin.req('GET', '/api/settings'))).toEqual({ marqueeSpeed: 80, marqueePause: 3, changeoverTime: '14:00', signTheme: 'auto', darkFrom: '20:00', darkUntil: '07:00', staleAfterMinutes: 3, offlineAfterHours: 72, carouselImageSeconds: 10, nightClock: true, carouselFit: 'contain', brandColor: '#10508c', freeColor: '#14ae5c', occupiedColor: '#e5322d', reservedColor: '#e8b931' });
    expect((await admin.req('PUT', '/api/settings', { marqueeSpeed: 50, marqueePause: 2, changeoverTime: '14:00', signTheme: 'auto', darkFrom: '20:00', darkUntil: '07:00', staleAfterMinutes: 3, offlineAfterHours: 72, carouselImageSeconds: 10, nightClock: true, carouselFit: 'contain', brandColor: '#10508c', freeColor: '#14ae5c', occupiedColor: '#e5322d', reservedColor: '#e8b931' })).status).toBe(403);

    const superadmin = t.client();
    await superadmin.login('superadmin');
    expect((await superadmin.req('PUT', '/api/settings', { marqueeSpeed: 5, marqueePause: 2, changeoverTime: '14:00', signTheme: 'auto', darkFrom: '20:00', darkUntil: '07:00', staleAfterMinutes: 3, offlineAfterHours: 72, carouselImageSeconds: 10, nightClock: true, carouselFit: 'contain', brandColor: '#10508c', freeColor: '#14ae5c', occupiedColor: '#e5322d', reservedColor: '#e8b931' })).status).toBe(400);
    expect((await superadmin.req('PUT', '/api/settings', { marqueeSpeed: 50, marqueePause: 2, changeoverTime: '25:00', signTheme: 'auto', darkFrom: '20:00', darkUntil: '07:00', staleAfterMinutes: 3, offlineAfterHours: 72, carouselImageSeconds: 10, nightClock: true, carouselFit: 'contain', brandColor: '#10508c', freeColor: '#14ae5c', occupiedColor: '#e5322d', reservedColor: '#e8b931' })).status).toBe(400);
    const before = await t.app.request('/api/display');
    const saved = await superadmin.req('PUT', '/api/settings', { marqueeSpeed: 50, marqueePause: 1.5, changeoverTime: '13:30', signTheme: 'dark', darkFrom: '20:00', darkUntil: '07:00', staleAfterMinutes: 3, offlineAfterHours: 72, carouselImageSeconds: 10, nightClock: true, carouselFit: 'contain', brandColor: '#10508c', freeColor: '#14ae5c', occupiedColor: '#e5322d', reservedColor: '#e8b931' });
    expect(await json(saved)).toEqual({ marqueeSpeed: 50, marqueePause: 1.5, changeoverTime: '13:30', signTheme: 'dark', darkFrom: '20:00', darkUntil: '07:00', staleAfterMinutes: 3, offlineAfterHours: 72, carouselImageSeconds: 10, nightClock: true, carouselFit: 'contain', brandColor: '#10508c', freeColor: '#14ae5c', occupiedColor: '#e5322d', reservedColor: '#e8b931' });

    // The snapshot changes, so the sign fetches the new settings at its next poll.
    const after = await t.app.request('/api/display', { headers: { 'if-none-match': before.headers.get('etag')! } });
    expect(after.status).toBe(200);
    expect((await json<DisplaySnapshot>(after)).settings).toEqual({ marqueeSpeed: 50, marqueePause: 1.5, changeoverTime: '13:30', signTheme: 'dark', darkFrom: '20:00', darkUntil: '07:00', staleAfterMinutes: 3, offlineAfterHours: 72, carouselImageSeconds: 10, nightClock: true, carouselFit: 'contain', brandColor: '#10508c', freeColor: '#14ae5c', occupiedColor: '#e5322d', reservedColor: '#e8b931' });
  });
});

describe('generic logos', () => {
  it('are listed for admins and copied into an organizer as a normal logo', async () => {
    const t = setup();
    const { admin, org } = await seed(t);
    expect((await t.app.request('/api/generic-logos')).status).toBe(401);
    const list = await json<{ id: string; name: string }[]>(await admin.req('GET', '/api/generic-logos'));
    expect(list.length).toBeGreaterThan(10);
    expect((await admin.req('GET', `/api/generic-logos/${list[0]!.id}`)).headers.get('content-type')).toBe('image/svg+xml');

    const copied = await admin.req('POST', `/api/organizers/${org.id}/logos`, { generic: 'universita' });
    expect(copied.status).toBe(201);
    const { id } = await json<{ id: number }>(copied);
    expect((await t.app.request(`/api/logos/${id}`)).headers.get('content-type')).toBe('image/png');
    expect((await admin.req('POST', `/api/organizers/${org.id}/logos`, { generic: 'nope' })).status).toBe(400);
  });
});

describe('venue logo', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#10508c"/></svg>';
  const upload = (text: string) => {
    const form = new FormData();
    form.append('file', new Blob([text], { type: 'image/svg+xml' }), 'logo.svg');
    return form;
  };

  it('is uploaded by the superadmin, served safely and versioned in the snapshot', async () => {
    const t = setup();
    const admin = t.client();
    await admin.login();
    const superadmin = t.client();
    await superadmin.login('superadmin');

    expect((await t.app.request('/api/venue-logo')).status).toBe(404);
    expect((await json<DisplaySnapshot>(await t.app.request('/api/display'))).venueLogo).toBeNull();
    expect((await admin.req('PUT', '/api/venue-logo', upload(svg))).status).toBe(403);
    expect((await superadmin.req('PUT', '/api/venue-logo', upload('not an image'))).status).toBe(400);
    expect((await superadmin.req('PUT', '/api/venue-logo', upload(svg.replace('<rect', '<script>alert(1)</script><rect')))).status).toBe(400);

    const saved = await json<{ version: string }>(await superadmin.req('PUT', '/api/venue-logo', upload(svg)));
    expect((await json<DisplaySnapshot>(await t.app.request('/api/display'))).venueLogo).toBe(saved.version);
    const served = await t.app.request(`/api/venue-logo?v=${saved.version}`);
    expect(served.headers.get('content-type')).toContain('image/svg+xml');
    expect(served.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(served.headers.get('cache-control')).toContain('immutable');
    expect(await served.text()).toBe(svg);

    expect((await superadmin.req('DELETE', '/api/venue-logo')).status).toBe(204);
    expect((await t.app.request('/api/venue-logo')).status).toBe(404);
  });
});

describe('media', () => {
  it('uploads images (resized) and videos, serves ranges, reorders and deletes', async () => {
    const t = setup();
    const superadmin = t.client();
    await superadmin.login('superadmin');
    const admin = t.client();
    await admin.login();

    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#336699' } }).jpeg().toBuffer();
    const post = (c: typeof admin, body: Uint8Array, type: string, name: string) =>
      t.app.request('/api/media', { method: 'POST', body, headers: { 'content-type': type, 'x-file-name': encodeURIComponent(name), cookie: c.cookie() } });

    expect((await post(admin, big, 'image/jpeg', 'Foto.jpg')).status).toBe(403);
    const image = await post(superadmin, big, 'image/jpeg', 'Foto sala.jpg');
    expect(image.status).toBe(201);
    const { id: imageId } = await json<{ id: number }>(image);
    const served = await t.app.request(`/api/media/${imageId}`);
    expect(served.headers.get('content-type')).toBe('image/jpeg');
    expect((await sharp(Buffer.from(await served.arrayBuffer())).metadata()).width).toBe(1440); // 4000×3000 fitted in 1920×1080

    // A minimal MP4 header is enough for the server, which doesn't decode videos.
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(100, 7)]);
    expect((await post(superadmin, Buffer.from('not a video at all'), 'video/mp4', 'x.mp4')).status).toBe(400);
    const video = await post(superadmin, mp4, 'video/mp4', 'Spot.mp4');
    const { id: videoId } = await json<{ id: number }>(video);
    const part = await t.app.request(`/api/media/${videoId}`, { headers: { range: 'bytes=4-11' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe(`bytes 4-11/${mp4.length}`);
    expect(Buffer.from(await part.arrayBuffer()).toString('latin1')).toBe('ftypisom');

    expect((await json<DisplaySnapshot>(await t.app.request('/api/display'))).media).toEqual([
      { id: imageId, kind: 'image', fit: null },
      { id: videoId, kind: 'video', fit: null },
    ]);
    // Disabled items leave the sign; an item can have its own fit.
    await superadmin.req('PATCH', `/api/media/${imageId}`, { enabled: false });
    await superadmin.req('PATCH', `/api/media/${videoId}`, { fit: 'cover' });
    expect((await json<DisplaySnapshot>(await t.app.request('/api/display'))).media).toEqual([{ id: videoId, kind: 'video', fit: 'cover' }]);
    expect((await superadmin.req('PATCH', `/api/media/${videoId}`, { fit: 'zoom' })).status).toBe(400);
    await superadmin.req('PATCH', `/api/media/${imageId}`, { enabled: true });
    await superadmin.req('PUT', '/api/media/order', { ids: [videoId, imageId] });
    expect((await json<{ id: number }[]>(await admin.req('GET', '/api/media'))).map((m) => m.id)).toEqual([videoId, imageId]);

    expect((await superadmin.req('DELETE', `/api/media/${imageId}`)).status).toBe(204);
    expect((await t.app.request(`/api/media/${imageId}`)).status).toBe(404);
  });
});
