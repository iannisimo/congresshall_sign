import { describe, expect, it } from 'vitest';
import type { SignEvent } from '../../shared/model.ts';
import { HOUR } from '../../shared/time.ts';
import { buildSignView } from './schedule.ts';

const NOW = new Date('2026-10-17T10:00:00').getTime();
const at = (iso: string) => new Date(iso).getTime();

function event(id: number, start: string, end: string, visible = true, eventId = id): SignEvent {
  return {
    id,
    eventId,
    date: start.slice(0, 10),
    organizerId: 1,
    organizerName: 'Org',
    logoId: null,
    title: `E${id}`,
    subtitle: null,
    roomIds: [1],
    prepAt: at(start) - HOUR,
    startAt: at(start),
    endAt: at(end),
    releaseAt: at(end) + HOUR,
    breaks: [],
    visible,
  };
}

describe('buildSignView', () => {
  it("features today's running and upcoming events, then lists the next days", () => {
    const view = buildSignView(
      [
        event(1, '2026-10-17T08:00', '2026-10-17T09:30'), // over
        event(2, '2026-10-17T14:00', '2026-10-17T16:00'),
        event(3, '2026-10-17T09:00', '2026-10-17T12:00'), // running
        event(4, '2026-10-18T09:00', '2026-10-18T10:00'),
        event(5, '2026-10-17T18:00', '2026-10-17T19:00', false), // hidden
        event(6, '2026-10-20T09:00', '2026-10-20T10:00'),
        event(7, '2026-10-21T09:00', '2026-10-21T10:00'), // beyond the horizon
      ],
      NOW,
    );
    expect(view.featuredDay).toBe(at('2026-10-17T00:00'));
    expect(view.featured.map((e) => e.id)).toEqual([3, 2]);
    expect(view.comingUp.map((g) => [g.day, g.events.map((e) => e.id)])).toEqual([
      [at('2026-10-18T00:00'), [4]],
      [at('2026-10-20T00:00'), [6]],
    ]);
  });

  it('features the next day with events when today has nothing left', () => {
    const view = buildSignView([event(1, '2026-10-19T09:00', '2026-10-19T10:00'), event(2, '2026-10-20T09:00', '2026-10-20T10:00')], NOW);
    expect(view.featuredDay).toBe(at('2026-10-19T00:00'));
    expect(view.featured.map((e) => e.id)).toEqual([1]);
    expect(view.comingUp.map((g) => g.events.map((e) => e.id))).toEqual([[2]]);
  });

  it('merges the bookings of one event on a day into one coming-up line, but features each one', () => {
    const view = buildSignView(
      [
        { ...event(1, '2026-10-17T09:00', '2026-10-17T12:00', true, 9), roomIds: [1] },
        { ...event(2, '2026-10-17T14:00', '2026-10-17T17:00', true, 9), roomIds: [2, 1] },
        { ...event(3, '2026-10-18T14:00', '2026-10-18T17:00', true, 9), roomIds: [2, 3] },
        { ...event(4, '2026-10-18T09:00', '2026-10-18T12:00', true, 9), roomIds: [1, 2] },
        event(5, '2026-10-18T10:00', '2026-10-18T11:00'),
      ],
      NOW,
    );
    expect(view.featured.map((e) => e.id)).toEqual([1, 2]);
    expect(view.comingUp).toHaveLength(1);
    const [congress, other] = view.comingUp[0]!.events;
    expect(congress).toMatchObject({ id: 4, startAt: at('2026-10-18T09:00'), endAt: at('2026-10-18T17:00'), roomIds: [1, 2, 3] });
    expect(other!.id).toBe(5);
  });

  it('is empty without events', () => {
    expect(buildSignView([], NOW)).toEqual({ featuredDay: null, featured: [], comingUp: [] });
  });
});
