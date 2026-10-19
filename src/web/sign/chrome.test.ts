import { describe, expect, it } from 'vitest';
import { parseChrome } from './chrome.ts';

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
