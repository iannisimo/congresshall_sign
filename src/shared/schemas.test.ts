import { describe, expect, it } from 'vitest';
import { eventInputSchema, roomInputSchema } from './schemas.ts';

const valid = {
  organizerId: 1,
  logoId: null,
  title: '  Congresso  ',
  subtitle: '',
  roomIds: [1, 2],
  prepAt: 100,
  startAt: 200,
  endAt: 300,
  releaseAt: 400,
  visible: true,
};

describe('eventInputSchema', () => {
  it('trims text and turns empty text into null', () => {
    expect(eventInputSchema.parse(valid)).toMatchObject({ title: 'Congresso', subtitle: null });
  });

  it.each([
    [{ prepAt: 201 }, 'prepAt'],
    [{ endAt: 200 }, 'endAt'],
    [{ releaseAt: 299 }, 'releaseAt'],
    [{ roomIds: [] }, 'roomIds'],
    [{ roomIds: [1, 1] }, 'roomIds'],
    [{ title: ' ' }, 'title'],
  ])('rejects %o at %s', (patch, path) => {
    const result = eventInputSchema.safeParse({ ...valid, ...patch });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join('.'))).toContain(path);
  });

  it('allows instant preparation and release', () => {
    expect(eventInputSchema.safeParse({ ...valid, prepAt: 200, releaseAt: 300 }).success).toBe(true);
  });
});

describe('roomInputSchema', () => {
  it('only lets sub-rooms have parents', () => {
    expect(roomInputSchema.safeParse({ name: 'A', kind: 'main', parentIds: [1], blockedMessage: null }).success).toBe(false);
    expect(roomInputSchema.safeParse({ name: 'A1', kind: 'sub', parentIds: [1], blockedMessage: null }).success).toBe(true);
  });
});
