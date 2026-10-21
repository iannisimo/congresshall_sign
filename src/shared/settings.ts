import type { Settings } from './model.ts';

export const DEFAULT_SETTINGS: Settings = {
  marqueeSpeed: 80,
  marqueeVerticalSpeed: 15,
  marqueePause: 3,
  prepTime: '14:00',
  prepMinGapHours: 1,
  cleanupTime: '14:00',
  cleanupMinGapHours: 1,
  signTheme: 'auto',
  darkFrom: '20:00',
  darkUntil: '07:00',
  staleAfterMinutes: 3,
  offlineAfterHours: 72,
  carouselImageSeconds: 10,
  nightClock: true,
  carouselFit: 'contain',
  brandColor: '#10508c',
  freeColor: '#14ae5c',
  occupiedColor: '#e5322d',
  reservedColor: '#e8b931',
};

/** Main colours offered in the settings; any other can be typed as hex. */
export const BRAND_PRESETS = [
  { name: 'Blu', color: '#10508c' },
  { name: 'Ottanio', color: '#0f6e74' },
  { name: 'Verde', color: '#1d6b3a' },
  { name: 'Bordeaux', color: '#7a1f3d' },
  { name: 'Viola', color: '#5b2a86' },
  { name: 'Terracotta', color: '#a4471c' },
  { name: 'Ardesia', color: '#334155' },
  { name: 'Nero', color: '#111827' },
] as const;

/**
 * The sign is sized in rem and 1rem is 20px on a 1080p screen. Speeds are set for that screen and
 * scaled with the rem, so text moves at the same pace relative to its size on any resolution.
 */
export const REFERENCE_REM_PX = 20;
