import { describe, expect, it } from 'vitest';
import type { EventBooking, ScheduledEvent } from '../../shared/model.ts';
import { mergeRanges, restaurantRows, restaurantWindow } from './restaurantRows.ts';

const at = (date: string, time: string) => new Date(`${date}T${time}`).getTime();
const now = at('2026-10-19', '15:30');

function booking(date: string, from: string, to: string, breaks: EventBooking['breaks'] = []): EventBooking {
  return { id: 1, label: null, roomIds: [1], startAt: at(date, from), endAt: at(date, to), breaks };
}
function event(id: number, visible: boolean, days: [string, EventBooking[]][]): ScheduledEvent {
  return {
    id, organizerId: 1, organizerName: `Org ${id}`, logoId: null, title: `Titolo ${id}`, subtitle: null, visible, lowPriority: false,
    startDate: days[0]![0], endDate: days[days.length - 1]![0], receptionNotes: null, costCents: null, bookingNumber: null, prepAt: 0, releaseAt: 0,
    days: days.map(([date, bookings]) => ({ date, receptionNotes: null, housekeepingNotes: null, restaurantNotes: null, bookings })),
  };
}

describe('restaurantRows', () => {
  it('spans 14 days from today', () => {
    expect(restaurantWindow(now)).toEqual({ first: '2026-10-19', last: '2026-11-01' });
  });

  it('merges touching and overlapping ranges only', () => {
    expect(mergeRanges([{ startAt: 5, endAt: 8 }, { startAt: 1, endAt: 5 }, { startAt: 10, endAt: 12 }])).toEqual([
      { startAt: 1, endAt: 8 },
      { startAt: 10, endAt: 12 },
    ]);
  });

  it('builds rows: window, hours, deduplicated breaks, drafts, order', () => {
    const coffee = (d: string) => ({ label: 'Coffee break', startAt: at(d, '10:30'), endAt: at(d, '11:00') });
    const lunch = (d: string) => ({ label: 'Lunch', startAt: at(d, '13:00'), endAt: at(d, '14:00') });
    const rows = restaurantRows(
      [
        event(2, false, [['2026-10-25', [booking('2026-10-25', '09:00', '13:00'), booking('2026-10-25', '15:00', '18:00')]]]),
        event(1, true, [
          ['2026-10-18', [booking('2026-10-18', '09:00', '18:00')]],
          ['2026-10-20', [booking('2026-10-20', '09:00', '13:00', [coffee('2026-10-20'), lunch('2026-10-20')]), booking('2026-10-20', '13:00', '18:00', [coffee('2026-10-20')])]],
          ['2026-10-21', []],
        ]),
        event(3, true, [['2026-11-02', [booking('2026-11-02', '09:00', '10:00')]]]),
      ],
      now,
    );
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
    expect(rows[0]!.days).toEqual([
      { date: '2026-10-20', hours: '09:00–18:00', breaks: ['Coffee break 10:30–11:00', 'Lunch 13:00–14:00'], notes: null },
    ]);
    expect(rows[1]).toMatchObject({ draft: true });
    expect(rows[1]!.days[0]).toEqual({ date: '2026-10-25', hours: '09:00–13:00, 15:00–18:00', breaks: [], notes: null });
  });

  it('prints breaks outside the booking hours too, in time order', () => {
    const breakfast = { label: 'Breakfast', startAt: at('2026-10-20', '07:30'), endAt: at('2026-10-20', '08:30') };
    const coffee = { label: 'Coffee break', startAt: at('2026-10-20', '10:30'), endAt: at('2026-10-20', '11:00') };
    const dinner = { label: 'Dinner', startAt: at('2026-10-20', '20:00'), endAt: at('2026-10-20', '21:30') };
    const rows = restaurantRows([event(1, true, [['2026-10-20', [booking('2026-10-20', '09:00', '18:00', [dinner, coffee, breakfast])]]])], now);
    expect(rows[0]!.days[0]!.breaks).toEqual(['Breakfast 07:30–08:30', 'Coffee break 10:30–11:00', 'Dinner 20:00–21:30']);
  });

  it('prints each day\'s effective restaurant note, inherited ones in full', () => {
    const e = event(1, true, [
      ['2026-10-20', [booking('2026-10-20', '09:00', '18:00')]],
      ['2026-10-21', [booking('2026-10-21', '09:00', '18:00')]],
      ['2026-10-22', [booking('2026-10-22', '09:00', '18:00')]],
    ]);
    e.days[0]!.restaurantNotes = 'Menu vegano\n20 coperti';
    e.days[2]!.restaurantNotes = '—';
    const days = restaurantRows([e], at('2026-10-20', '08:00'))[0]!.days;
    expect(days.map((d) => d.notes)).toEqual(['Menu vegano\n20 coperti', 'Menu vegano\n20 coperti', null]);
  });
});
