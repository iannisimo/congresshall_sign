import { describe, expect, it } from 'vitest';
import type { Takeover } from '../../shared/model.ts';
import { activeTakeover, parseChrome, takeoverChrome } from './chrome.ts';

describe('parseChrome', () => {
  it('shows both by default', () => {
    expect(parseChrome('')).toEqual({ header: true, footer: true });
    expect(parseChrome('?preset=bar&mode=dark')).toEqual({ header: true, footer: true });
  });

  it('hides with 0, false, no, off in any case', () => {
    for (const v of ['0', 'false', 'No', 'OFF']) {
      expect(parseChrome(`?header=${v}&footer=${v}`)).toEqual({ header: false, footer: false });
    }
  });

  it('works independently and with other params', () => {
    expect(parseChrome('?preset=x&footer=0')).toEqual({ header: true, footer: false });
    expect(parseChrome('?header=off&mode=light')).toEqual({ header: false, footer: true });
    expect(parseChrome('?header=1&footer=yes')).toEqual({ header: true, footer: true });
  });
});

const takeover = (id: number, startAt: number, endAt: number, header: boolean | null = null, footer: boolean | null = null): Takeover => ({
  id,
  name: 'x',
  startAt,
  endAt,
  fit: 'contain',
  header,
  footer,
});

describe('activeTakeover', () => {
  it('is null before the start and from the end on', () => {
    const list = [takeover(1, 100, 200)];
    expect(activeTakeover(list, 99)).toBeNull();
    expect(activeTakeover(list, 100)?.id).toBe(1);
    expect(activeTakeover(list, 199)?.id).toBe(1);
    expect(activeTakeover(list, 200)).toBeNull();
  });

  it('prefers the one that started last when they overlap', () => {
    const list = [takeover(1, 100, 500), takeover(2, 200, 300)];
    expect(activeTakeover(list, 150)?.id).toBe(1);
    expect(activeTakeover(list, 250)?.id).toBe(2);
    expect(activeTakeover(list, 350)?.id).toBe(1);
  });
});

describe('takeoverChrome', () => {
  const screen = { header: false, footer: true };
  it('follows the screen when the takeover has no preference', () => {
    expect(takeoverChrome(takeover(1, 0, 1), screen)).toEqual(screen);
  });
  it('overrides each part on its own', () => {
    expect(takeoverChrome(takeover(1, 0, 1, true, false), screen)).toEqual({ header: true, footer: false });
    expect(takeoverChrome(takeover(1, 0, 1, true), screen)).toEqual({ header: true, footer: true });
  });
});
