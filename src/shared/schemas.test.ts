import { describe, expect, it } from 'vitest';
import { eventInputSchema, roomInputSchema } from './schemas.ts';

const at = (date: string, time: string) => new Date(`${date}T${time}`).getTime();

function booking(date: string, extra: Record<string, unknown> = {}) {
  return {
    label: null,
    roomIds: [1, 2],
    startAt: at(date, '09:00'),
    endAt: at(date, '13:00'),
    ...extra,
  };
}

const day = (date: string, bookings: unknown[] = [booking(date)]) => ({ date, bookings });

const valid = {
  organizerId: 1,
  logoId: null,
  title: '  Congresso  ',
  subtitle: '',
  visible: true,
  prepAt: at('2026-10-19', '14:00'),
  releaseAt: at('2026-10-21', '14:00'),
  days: [day('2026-10-20'), day('2026-10-21')],
};

function paths(patch: Record<string, unknown>) {
  const result = eventInputSchema.safeParse({ ...valid, ...patch });
  expect(result.success).toBe(false);
  return result.error!.issues.map((i) => i.path.join('.'));
}

describe('eventInputSchema', () => {
  it('trims text and turns empty text into null', () => {
    expect(eventInputSchema.parse(valid)).toMatchObject({ title: 'Congresso', subtitle: null, receptionNotes: null });
    expect(eventInputSchema.parse(valid).days[1]).toMatchObject({ receptionNotes: null, housekeepingNotes: null });
  });

  it.each([
    [{ title: ' ' }, 'title'],
    [{ days: [] }, 'days'],
    [{ days: [day('2026-10-20'), day('2026-10-22')] }, 'days.1.date'],
    [{ days: [day('2026-10-20'), day('2026-10-20')] }, 'days.1.date'],
    [{ days: [day('2026-10-21'), day('2026-10-20')] }, 'days.1.date'],
    [{ days: [day('2026-10-20', []), day('2026-10-21', [])] }, 'days.0.bookings'],
    [{ days: [day('2026-10-20', [booking('2026-10-21')])] }, 'days.0.bookings.0.startAt'],
    [{ days: [day('2026-10-20', [booking('2026-10-20', { roomIds: [] })])] }, 'days.0.bookings.0.roomIds'],
    [{ prepAt: at('2026-10-20', '09:01') }, 'prepAt'],
    [{ days: [day('2026-10-20', [booking('2026-10-20', { endAt: at('2026-10-20', '09:00') })])] }, 'days.0.bookings.0.endAt'],
    [{ releaseAt: at('2026-10-21', '12:00') }, 'releaseAt'],
  ])('rejects %o at %s', (patch, path) => {
    expect(paths(patch)).toContain(path);
  });

  it('allows a day with no bookings, and a booking running past midnight', () => {
    const late = booking('2026-10-20', { startAt: at('2026-10-20', '22:00'), endAt: at('2026-10-21', '01:00') });
    expect(eventInputSchema.safeParse({ ...valid, releaseAt: at('2026-10-21', '02:00'), days: [day('2026-10-20', [late]), day('2026-10-21', [])] }).success).toBe(true);
  });

  it('allows instant preparation and release', () => {
    const b = booking('2026-10-20');
    expect(eventInputSchema.safeParse({ ...valid, prepAt: at('2026-10-20', '09:00'), releaseAt: at('2026-10-20', '13:00'), days: [day('2026-10-20', [b])] }).success).toBe(true);
  });

  it('refuses two bookings of one event in the same room at the same time', () => {
    const morning = booking('2026-10-20', { roomIds: [1] });
    const overlapping = booking('2026-10-20', { roomIds: [2, 1], startAt: at('2026-10-20', '12:00'), endAt: at('2026-10-20', '15:00') });
    expect(paths({ days: [day('2026-10-20', [morning, overlapping])] })).toContain('days.0.bookings.1.roomIds');
    const otherRoom = { ...overlapping, roomIds: [2] };
    expect(eventInputSchema.safeParse({ ...valid, days: [day('2026-10-20', [morning, otherRoom])] }).success).toBe(true);
    const afterwards = { ...overlapping, startAt: at('2026-10-20', '13:00') };
    expect(eventInputSchema.safeParse({ ...valid, days: [day('2026-10-20', [morning, afterwards])] }).success).toBe(true);
  });
});

describe('roomInputSchema', () => {
  it('only lets sub-rooms have parents', () => {
    expect(roomInputSchema.safeParse({ name: 'A', kind: 'main', parentIds: [1], blockedMessage: null }).success).toBe(false);
    expect(roomInputSchema.safeParse({ name: 'A1', kind: 'sub', parentIds: [1], blockedMessage: null }).success).toBe(true);
  });
});

describe('booking breaks', () => {
  const coffee = { label: 'Coffee break', startAt: at('2026-10-20', '10:00'), endAt: at('2026-10-20', '10:30') };
  const withBreaks = (breaks: unknown[]) => ({ ...valid, days: [day('2026-10-20', [booking('2026-10-20', { breaks })])] });

  it('accept breaks inside the booking, and default to none', () => {
    expect(eventInputSchema.parse(valid).days[0]!.bookings[0]!.breaks).toEqual([]);
    expect(eventInputSchema.safeParse(withBreaks([coffee])).success).toBe(true);
  });

  it('accept breaks outside the booking hours (printed only)', () => {
    const breakfast = { label: 'Breakfast', startAt: at('2026-10-20', '07:30'), endAt: at('2026-10-20', '08:15') };
    const dinner = { label: 'Dinner', startAt: at('2026-10-20', '20:00'), endAt: at('2026-10-20', '21:30') };
    expect(eventInputSchema.safeParse(withBreaks([breakfast, coffee, dinner])).success).toBe(true);
  });

  it.each([
    [[{ ...coffee, startAt: at('2026-10-18', '10:00'), endAt: at('2026-10-18', '10:30') }], 'days away from the booking'],
    [[coffee, { label: 'Break', startAt: at('2026-10-20', '10:15'), endAt: at('2026-10-20', '11:00') }], 'overlapping'],
    [[{ ...coffee, label: ' ' }], 'without a name'],
    [[{ ...coffee, endAt: coffee.startAt }], 'empty'],
  ])('reject %o (%s)', (breaks) => {
    expect(eventInputSchema.safeParse(withBreaks(breaks)).success).toBe(false);
  });
});
