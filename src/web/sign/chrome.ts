import type { Takeover } from '../../shared/model.ts';

/** `?header=0` / `?footer=0` hide the sign's header and room strip; anything else (or absent) shows them. */
export type SignChrome = { header: boolean; footer: boolean };

const OFF = new Set(['0', 'false', 'no', 'off']);

export function parseChrome(search: string): SignChrome {
  const params = new URLSearchParams(search);
  const shown = (name: string) => !OFF.has((params.get(name) ?? '').trim().toLowerCase());
  return { header: shown('header'), footer: shown('footer') };
}

/** The takeover on screen at `now`: of those running, the one that started last. */
export function activeTakeover(takeovers: Takeover[], now: number): Takeover | null {
  let active: Takeover | null = null;
  for (const t of takeovers) {
    if (t.startAt <= now && now < t.endAt && (!active || t.startAt >= active.startAt)) active = t;
  }
  return active;
}

/** A takeover's own header/footer choice wins over the screen's `?header=` / `?footer=`. */
export function takeoverChrome(takeover: Takeover, screen: SignChrome): SignChrome {
  return { header: takeover.header ?? screen.header, footer: takeover.footer ?? screen.footer };
}
