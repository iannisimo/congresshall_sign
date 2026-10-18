import type { Settings } from './model.ts';

export const DEFAULT_SETTINGS: Settings = {
  marqueeSpeed: 80,
  marqueePause: 3,
  changeoverTime: '14:00',
};

/**
 * The sign is sized in rem and 1rem is 20px on a 1080p screen. Speeds are set for that screen and
 * scaled with the rem, so text moves at the same pace relative to its size on any resolution.
 */
export const REFERENCE_REM_PX = 20;
