import { describe, expect, it } from 'vitest';
import { pageBreaks } from './EventsPrint.tsx';

describe('pageBreaks', () => {
  it('lets events share a page while they fit', () => {
    expect([...pageBreaks([300, 300, 300], 1000)]).toEqual([]);
  });

  it('moves an event that does not fit what is left to the next page', () => {
    expect([...pageBreaks([600, 500, 100], 1000)]).toEqual([1]);
  });

  it('starts an event longer than a page on a fresh page, unless it is the first', () => {
    expect([...pageBreaks([2500, 200], 1000)]).toEqual([]);
    expect([...pageBreaks([200, 2500], 1000)]).toEqual([1]);
  });

  it('continues after a long event from where it ends', () => {
    expect([...pageBreaks([1500, 300, 400], 1000)]).toEqual([2]);
  });
});
