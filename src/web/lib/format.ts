// Formats for the sign: 12-hour times ("2:00 PM") and short English dates ("Sat 17 Oct"),
// chosen to read naturally for both English and Italian speakers.

const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
const dayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export function formatTime(t: number): string {
  return timeFormat.format(t);
}

/** "2:05" and "PM" separately, to style them differently. */
export function clockParts(t: number): { time: string; period: string } {
  const parts = timeFormat.formatToParts(t);
  const period = parts.find((p) => p.type === 'dayPeriod')?.value ?? '';
  const time = parts
    .filter((p) => p.type === 'hour' || p.type === 'minute' || (p.type === 'literal' && p.value === ':'))
    .map((p) => p.value)
    .join('');
  return { time, period };
}

export function formatDay(t: number): string {
  return dayFormat.format(t);
}

// Italian formats for the admin area.

const adminDayFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const adminTimeFormat = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
const adminShortDayFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });

export function formatAdminDay(t: number): string {
  return adminDayFormat.format(t);
}

export function formatAdminShortDay(t: number): string {
  return adminShortDayFormat.format(t);
}

export function formatAdminTime(t: number): string {
  return adminTimeFormat.format(t);
}
