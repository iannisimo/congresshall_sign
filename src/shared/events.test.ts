import { describe, expect, it } from 'vitest';
import { dayHours, effectiveDayNotes, eventDates, eventToInput, flattenEvent, shiftEvent } from './events.ts';
import type { EventBooking, ScheduledEvent } from './model.ts';
import { eventInputSchema } from './schemas.ts';

const at = (date: string, time: string) => new Date(`${date}T${time}`).getTime();

function booking(id: number, date: string, roomIds: number[], from = '09:00', to = '13:00'): EventBooking {
  return {
    id,
    label: 'Plenaria',
    roomIds,
    startAt: at(date, from),
    endAt: at(date, to),
    breaks: [{ label: 'Coffee break', startAt: at(date, from === '09:00' ? '10:30' : '15:30'), endAt: at(date, from === '09:00' ? '11:00' : '16:00') }],
  };
}

const event: ScheduledEvent = {
  id: 5,
  organizerId: 1,
  organizerName: 'Unipi',
  logoId: null,
  title: 'Congresso',
  subtitle: null,
  visible: true,
  startDate: '2026-10-24',
  endDate: '2026-10-26',
  receptionNotes: 'Badge',
  costCents: 123450,
  bookingNumber: 'PR-77',
  prepAt: at('2026-10-24', '08:00'),
  releaseAt: at('2026-10-25', '19:00'),
  days: [
    { date: '2026-10-24', receptionNotes: 'Banco 1', housekeepingNotes: 'Platea', restaurantNotes: 'Menu A', bookings: [booking(1, '2026-10-24', [1])] },
    {
      date: '2026-10-25',
      receptionNotes: null,
      housekeepingNotes: null, restaurantNotes: null,
      bookings: [booking(2, '2026-10-25', [1]), booking(3, '2026-10-25', [2, 3], '14:00', '18:00')],
    },
    { date: '2026-10-26', receptionNotes: '—', housekeepingNotes: null, restaurantNotes: null, bookings: [] },
  ],
};

describe('flattenEvent', () => {
  it('makes one sign event per booking, without notes or labels', () => {
    const flat = flattenEvent(event);
    expect(flat.map((e) => [e.id, e.eventId, e.date])).toEqual([
      [1, 5, '2026-10-24'],
      [2, 5, '2026-10-25'],
      [3, 5, '2026-10-25'],
    ]);
    expect(JSON.stringify(flat)).not.toMatch(/Badge|Banco|Platea|Plenaria|Menu A|PR-77|123450/);
  });
});

describe('effectiveDayNotes', () => {
  it('resolves null on later days to the previous day, recursively', () => {
    expect(effectiveDayNotes(event, 0)).toEqual({
      receptionNotes: 'Banco 1',
      housekeepingNotes: 'Platea',
      restaurantNotes: 'Menu A',
      inherited: { receptionNotes: false, housekeepingNotes: false, restaurantNotes: false },
    });
    expect(effectiveDayNotes(event, 1)).toEqual({
      receptionNotes: 'Banco 1',
      housekeepingNotes: 'Platea',
      restaurantNotes: 'Menu A',
      inherited: { receptionNotes: true, housekeepingNotes: true, restaurantNotes: true },
    });
    // "—" is a note of its own and stops the chain for reception; housekeeping still goes back two days.
    expect(effectiveDayNotes(event, 2)).toEqual({
      receptionNotes: '—',
      housekeepingNotes: 'Platea',
      restaurantNotes: 'Menu A',
      inherited: { receptionNotes: false, housekeepingNotes: true, restaurantNotes: true },
    });
  });

  it('means no note on the first day', () => {
    const none = { days: [{ receptionNotes: null, housekeepingNotes: null, restaurantNotes: null }] };
    expect(effectiveDayNotes(none, 0)).toMatchObject({ receptionNotes: null, housekeepingNotes: null, restaurantNotes: null });
  });
});

describe('eventDates, dayHours', () => {
  it('lists every date, across a month end', () => {
    expect(eventDates('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(eventDates('2026-10-30', '2026-10-29')).toEqual([]);
  });

  it('gives the earliest start and latest end, or null', () => {
    expect(dayHours(event.days[1]!)).toEqual({ startAt: at('2026-10-25', '09:00'), endAt: at('2026-10-25', '18:00') });
    expect(dayHours(event.days[2]!)).toBeNull();
  });
});

describe('eventToInput, shiftEvent', () => {
  const input = eventToInput(event);

  it('turns a saved event into a valid input', () => {
    expect(eventInputSchema.safeParse(input).success).toBe(true);
    expect(input.days[0]!.bookings[0]).not.toHaveProperty('id');
  });

  it('moves dates and times by whole days, keeping the clock time across the end of daylight saving', () => {
    // Clocks go back on 25 October 2026: day 1 is on the 24th, shifted by 2 days it lands on the 26th.
    const shifted = shiftEvent(input, 2);
    expect(shifted.days.map((d) => d.date)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
    const b = shifted.days[0]!.bookings[0]!;
    expect(b.startAt).toBe(at('2026-10-26', '09:00'));
    expect(b.breaks[0]!.startAt).toBe(at('2026-10-26', '10:30'));
    expect(eventInputSchema.safeParse(shifted).success).toBe(true);
    expect(shiftEvent(shifted, -2)).toEqual(input);
  });
});
