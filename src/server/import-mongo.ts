import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RoomKind } from '../shared/model.ts';
import { changeoverMargins, toDateValue } from '../shared/time.ts';
import { get, transaction, type Db } from './db/database.ts';
import { insertEvent } from './data/events.ts';
import { createOrganizer, findOrganizerByName, insertLogo } from './data/organizers.ts';
import { createRoom } from './data/rooms.ts';
import { getSettings } from './data/settings.ts';
import { normalizeLogo } from './images.ts';

// One-off import from the old MongoDB app, using files made with mongoexport (one JSON document per line):
//   mongoexport --db conferences --collection rooms  --out rooms.json
//   mongoexport --db conferences --collection events --out events.json
//   mongoexport --db conferences --collection logos  --out logos.json

type Json = Record<string, unknown>;

function readLines(path: string): Json[] {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const trimmed = text.trim();
  // mongoexport --jsonArray writes an array instead of lines.
  if (trimmed.startsWith('[')) return JSON.parse(trimmed) as Json[];
  return trimmed
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Json);
}

/** ObjectId as a string, from `{ "$oid": "…" }` or a plain string. */
function oid(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '$oid' in value) return String((value as { $oid: unknown }).$oid);
  return null;
}

/** Date from relaxed (`{ "$date": "…" }`) or canonical (`{ "$date": { "$numberLong": "…" } }`) extended JSON. */
function date(value: unknown): number | null {
  let raw: unknown = value;
  if (raw && typeof raw === 'object' && '$date' in raw) raw = (raw as { $date: unknown }).$date;
  if (raw && typeof raw === 'object' && '$numberLong' in raw) raw = Number((raw as { $numberLong: unknown }).$numberLong);
  const t = typeof raw === 'number' ? raw : typeof raw === 'string' ? Date.parse(raw) : NaN;
  return Number.isNaN(t) ? null : t;
}

function binary(value: unknown): Buffer | null {
  if (value && typeof value === 'object' && '$binary' in value) {
    const inner = (value as { $binary: unknown }).$binary;
    const base64 = typeof inner === 'string' ? inner : (inner as { base64?: unknown } | null)?.base64;
    if (typeof base64 === 'string') return Buffer.from(base64, 'base64');
  }
  return null;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function organizerId(db: Db, name: string): number {
  return findOrganizerByName(db, name)?.id ?? createOrganizer(db, name);
}

export interface ImportReport {
  rooms: number;
  organizers: number;
  logos: number;
  events: number;
  skipped: string[];
}

export async function importMongo(db: Db, dir: string, now: number): Promise<ImportReport> {
  const roomDocs = readLines(join(dir, 'rooms.json'));
  const eventDocs = readLines(join(dir, 'events.json'));
  const logoDocs = readLines(join(dir, 'logos.json'));
  if ((get<{ n: number }>(db, 'SELECT count(*) AS n FROM rooms')?.n ?? 0) > 0) {
    throw new Error('The database already has rooms: the import only runs on a new, empty database.');
  }

  const settings = getSettings(db);
  const report: ImportReport = { rooms: 0, organizers: 0, logos: 0, events: 0, skipped: [] };

  // Logos first, outside the transaction: resizing them is async.
  const logos: { oid: string; org: string; logo: Awaited<ReturnType<typeof normalizeLogo>> }[] = [];
  for (const doc of logoDocs) {
    const data = binary(doc['data']);
    const id = oid(doc['_id']);
    if (!data || !id || !text(doc['org'])) continue;
    try {
      logos.push({ oid: id, org: text(doc['org']), logo: await normalizeLogo(data) });
    } catch {
      report.skipped.push(`logo ${id}: not a usable image`);
    }
  }

  transaction(db, () => {
    const organizersBefore = get<{ n: number }>(db, 'SELECT count(*) AS n FROM organizers')?.n ?? 0;

    // Main rooms first, so sub-rooms can point at them.
    const roomIds = new Map<string, number>();
    const bookable = new Set<number>();
    const kindOf = (doc: Json): RoomKind => (doc['type'] === 'sub' ? 'sub' : 'main');
    const ordered = [...roomDocs].sort((a, b) => (kindOf(a) === kindOf(b) ? 0 : kindOf(a) === 'main' ? -1 : 1));
    for (const doc of ordered) {
      const id = oid(doc['_id']);
      if (!id || !text(doc['name'])) continue;
      const kind = kindOf(doc);
      const parents = kind === 'sub' && Array.isArray(doc['sub_of']) ? doc['sub_of'].map(oid).flatMap((p) => (p && roomIds.get(p)) || []) : [];
      const roomId = createRoom(db, { name: text(doc['name']), kind, parentIds: parents, blockedMessage: text(doc['sub_msg']) || null });
      roomIds.set(id, roomId);
      if (kind === 'main') bookable.add(roomId);
      report.rooms += 1;
    }

    const logoIds = new Map<string, { id: number; organizerId: number }>();
    for (const { oid: id, org, logo } of logos) {
      const organizer = organizerId(db, org);
      logoIds.set(id, { id: insertLogo(db, { organizerId: organizer, ...logo }, now), organizerId: organizer });
      report.logos += 1;
    }

    for (const doc of eventDocs) {
      const id = oid(doc['_id']) ?? '?';
      const startAt = date(doc['start_time']);
      const endAt = date(doc['end_time']);
      const org = text(doc['org']);
      const rooms = (Array.isArray(doc['room_ids']) ? doc['room_ids'].map(oid).flatMap((r) => (r && roomIds.get(r)) || []) : []).filter(
        (r) => bookable.has(r),
      );
      if (startAt === null || endAt === null || endAt <= startAt || !org || !text(doc['title']) || rooms.length === 0) {
        report.skipped.push(`event ${id}: missing or invalid data`);
        continue;
      }
      const organizer = organizerId(db, org);
      const logo = logoIds.get(oid(doc['logo']) ?? '');
      insertEvent(
        db,
        {
          organizerId: organizer,
          logoId: logo && logo.organizerId === organizer ? logo.id : null,
          title: text(doc['title']),
          subtitle: text(doc['subtitle']) || null,
          visible: doc['enabled'] !== false,
          receptionNotes: null,
          days: [
            {
              date: toDateValue(startAt),
              receptionNotes: null,
              housekeepingNotes: null,
              bookings: [
                {
                  label: null,
                  roomIds: rooms,
                  prepAt: Math.min(date(doc['prep_time']) ?? startAt, startAt),
                  startAt,
                  endAt,
                  // The old app had no clean-up time: rooms stayed reserved until freed by hand.
                  releaseAt: changeoverMargins(startAt, endAt, settings).releaseAt,
                  breaks: [],
                },
              ],
            },
          ],
        },
        now,
      );
      report.events += 1;
    }

    report.organizers = (get<{ n: number }>(db, 'SELECT count(*) AS n FROM organizers')?.n ?? 0) - organizersBefore;
  });

  return report;
}
