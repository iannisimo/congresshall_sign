import { describe, expect, it } from 'vitest';
import { centsToInput, parseEuros } from './money.ts';

describe('parseEuros', () => {
  it('reads Italian and plain input', () => {
    expect(parseEuros('1.234,50')).toBe(123450);
    expect(parseEuros('1234.5')).toBe(123450);
    expect(parseEuros('€ 80')).toBe(8000);
    expect(parseEuros('1.234')).toBe(123400);
    expect(parseEuros('0,99')).toBe(99);
    expect(parseEuros('  ')).toBeNull();
  });
  it('rejects garbage', () => {
    expect(parseEuros('abc')).toBeNaN();
    expect(parseEuros('-5')).toBeNaN();
    expect(parseEuros('1,234')).toBeNaN();
  });
  it('round-trips', () => {
    expect(parseEuros(centsToInput(123450))).toBe(123450);
    expect(centsToInput(8000)).toBe('80');
  });
});
