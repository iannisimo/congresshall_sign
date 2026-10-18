import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { MINUTE } from '../shared/time.ts';
import { openDatabase } from './db/database.ts';
import { listEvents } from './data/events.ts';
import { listOrganizers } from './data/organizers.ts';
import { listRooms } from './data/rooms.ts';
import { importMongo } from './import-mongo.ts';

const lines = (docs: unknown[]) => docs.map((d) => JSON.stringify(d)).join('\n');

describe('importMongo', () => {
  it('imports mongoexport files from the old app', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mongo-import-'));
    const png = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#123456' } }).png().toBuffer();
    writeFileSync(
      join(dir, 'rooms.json'),
      lines([
        { _id: { $oid: 'r2' }, name: 'Foyer', type: 'sub', sub_of: ['r1'], sub_msg: 'Coffee break', cur_status: 0 },
        { _id: { $oid: 'r1' }, name: 'Sala A', type: 'main', cur_status: 1 },
      ]),
    );
    writeFileSync(
      join(dir, 'logos.json'),
      lines([{ _id: { $oid: 'l1' }, org: 'Unipi', mimetype: 'image/png', data: { $binary: { base64: png.toString('base64'), subType: '00' } } }]),
    );
    writeFileSync(
      join(dir, 'events.json'),
      lines([
        {
          _id: { $oid: 'e1' },
          enabled: true,
          org: 'Unipi',
          title: 'Convegno',
          subtitle: '',
          room_ids: ['r1'],
          logo: 'l1',
          start_time: { $date: '2026-10-17T08:00:00Z' },
          end_time: { $date: { $numberLong: String(Date.parse('2026-10-17T10:00:00Z')) } },
          prep_time: { $date: '2026-10-17T07:30:00Z' },
          resolved: false,
        },
        { _id: { $oid: 'e2' }, org: 'CNR', title: 'Senza sale', room_ids: [], start_time: { $date: '2026-10-17T08:00:00Z' } },
      ]),
    );

    const db = openDatabase(':memory:');
    const report = await importMongo(db, dir, 0);
    expect(report).toMatchObject({ rooms: 2, organizers: 1, logos: 1, events: 1 });
    expect(report.skipped).toHaveLength(1);

    const rooms = listRooms(db);
    const salaA = rooms.find((r) => r.name === 'Sala A')!;
    expect(rooms.find((r) => r.name === 'Foyer')).toMatchObject({ kind: 'sub', parentIds: [salaA.id], blockedMessage: 'Coffee break' });

    const [event] = listEvents(db, { from: 0, to: Date.parse('2027-01-01') });
    expect(event).toMatchObject({
      organizerName: 'Unipi',
      title: 'Convegno',
      subtitle: null,
      roomIds: [salaA.id],
      prepAt: Date.parse('2026-10-17T07:30:00Z'),
      releaseAt: Date.parse('2026-10-17T10:00:00Z') + 30 * MINUTE,
      visible: true,
    });
    expect(event!.logoId).toBe(listOrganizers(db)[0]!.logoIds[0]);

    await expect(importMongo(db, dir, 0)).rejects.toThrow(/empty database/);
  });
});
