const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

/** "1.234,50 €" */
export function formatEuros(cents: number): string {
  return euro.format(cents / 100);
}

/** The amount as typed back into the field: "1234,5" (no thousands separator, no symbol). */
export function centsToInput(cents: number | null): string {
  if (cents === null) return '';
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(whole) : `${whole},${String(rest).padStart(2, '0')}`;
}

/**
 * Euro amount typed by hand ("1.234,50", "1234.5", "€ 80") as cents. Empty is `null`; anything that
 * is not an amount is `NaN`. A dot followed by one or two digits is a decimal point, otherwise a thousands separator.
 */
export function parseEuros(text: string): number | null {
  const t = text.replace(/[€\s]/g, '');
  if (t === '') return null;
  let normal: string;
  if (t.includes(',')) normal = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d+\.\d{1,2}$/.test(t)) normal = t;
  else normal = t.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return Number.NaN;
  return Math.round(Number(normal) * 100);
}
