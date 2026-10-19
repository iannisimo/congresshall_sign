/** `?header=0` / `?footer=0` hide the sign's header and room strip; anything else (or absent) shows them. */
export type SignChrome = { header: boolean; footer: boolean };

const OFF = new Set(['0', 'false', 'no', 'off']);

export function parseChrome(search: string): SignChrome {
  const params = new URLSearchParams(search);
  const shown = (name: string) => !OFF.has((params.get(name) ?? '').trim().toLowerCase());
  return { header: shown('header'), footer: shown('footer') };
}
