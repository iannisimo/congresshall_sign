import { useState } from 'react';
import builtInLogo from '../assets/logo-small.svg';
import { clockParts } from '../lib/format.ts';

/** "2:00" with a smaller "PM". */
export function Time({ at, className = '', periodClassName = '' }: { at: number; className?: string; periodClassName?: string }) {
  const { time, period } = clockParts(at);
  return (
    <span className={`tabular whitespace-nowrap ${className}`}>
      {time}
      <span className={`ml-[0.2em] text-[0.55em] font-semibold tracking-wide ${periodClassName}`}>{period}</span>
    </span>
  );
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  return (words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [...(words[0] ?? '?')].slice(0, 2)).join('').toUpperCase();
}

/** Organizer logo, or its initials when there is none (or it fails to load). */
export function Logo({ logoId, name, className = '' }: { logoId: number | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  /** Square logos were cropped in the admin area: they fill the tile, with no extra border. */
  const [square, setSquare] = useState(false);
  if (logoId === null || failed) {
    return (
      <div className={`@container grid shrink-0 place-items-center rounded-[1rem] bg-brand-50 font-bold text-brand-800 ${className}`}>
        <span className="text-[2.2rem] tracking-tight @min-[1px]:text-[32cqw]">{initials(name)}</span>
      </div>
    );
  }
  return (
    // Always a white tile (not the theme's card colour), so dark logos stay readable at night.
    <div className={`grid shrink-0 place-items-center overflow-hidden rounded-[1rem] bg-[#fff] ${square ? '' : 'p-[0.5rem]'} ${className}`}>
      <img
        src={`/api/logos/${logoId}`}
        alt=""
        className="max-h-full max-w-full object-contain"
        onLoad={(e) => setSquare(e.currentTarget.naturalWidth === e.currentTarget.naturalHeight)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 text-[1.25rem] font-bold uppercase tracking-[0.18em] text-slate-500">{children}</h2>
  );
}

/** The venue logo: the one uploaded by the superadmin (by version), or the built-in one. */
export function VenueLogo({ version, className = '', onClick }: { version: string | null; className?: string; onClick?: () => void }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = version && failed !== version ? `/api/venue-logo?v=${version}` : builtInLogo;
  return <img src={src} alt="" className={className} onClick={onClick} onError={() => setFailed(version)} />;
}
