// Data shapes shared by the server, the sign and the admin area.
// All times are milliseconds since the epoch.

export type RoomKind = 'main' | 'sub';

export interface Room {
  id: number;
  name: string;
  /** Only main rooms can be booked; sub-rooms follow their parents. */
  kind: RoomKind;
  sortOrder: number;
  /** Main rooms this room belongs to. */
  parentIds: number[];
  /** Shown while an event is running in a parent room. */
  blockedMessage: string | null;
}

/**
 * A pause of an event (coffee break, lunch…). Inside the booking's hours it is shown on the sign while the
 * event is live; outside them (breakfast, dinner) it is only printed.
 */
export interface EventBreak {
  label: string;
  startAt: number;
  endAt: number;
}

/** Labels offered as defaults; any other label is allowed. */
export const BREAK_PRESETS = ['Break', 'Coffee break', 'Lunch'] as const;

/**
 * One room occupation on a day of an event: rooms, the period they are held and the pauses within it.
 * Several can share a day (plenary in one room in the morning, workshops in two others in the afternoon).
 */
export interface EventBooking {
  /** Changes every time the event is saved: don't keep it anywhere. */
  id: number;
  /** Internal name ("Plenaria", "Workshop"), never on the sign. */
  label: string | null;
  /** Booked rooms, in display order. */
  roomIds: number[];
  startAt: number;
  /** May be past midnight. */
  endAt: number;
  /** Pauses within [startAt, endAt), in time order. The rooms stay occupied during them. */
  breaks: EventBreak[];
}

/** One calendar date of an event. A day may have no bookings (an excursion): it still has notes. */
export interface EventDay {
  /** 'YYYY-MM-DD', local time of the server. */
  date: string;
  /** For the front desk; null on a day after the first means "same as the previous day". Never on the sign. */
  receptionNotes: string | null;
  /** For the cleaning staff, including how the room is prepared; same inheritance. Never on the sign. */
  housekeepingNotes: string | null;
  /** For the restaurant; same inheritance. Never on the sign. */
  restaurantNotes: string | null;
  /** By start time. */
  bookings: EventBooking[];
}

/** An event as the admin area gets it: one thing with a start and an end date, and its days. */
export interface ScheduledEvent {
  id: number;
  organizerId: number;
  organizerName: string;
  logoId: number | null;
  title: string;
  subtitle: string | null;
  /** Hidden events are drafts: not on the sign and no effect on room status. */
  visible: boolean;
  /** Shown on the standard sign, but ignored by /big (as if it did not exist). */
  lowPriority: boolean;
  /** = days[0].date */
  startDate: string;
  /** = the last day's date */
  endDate: string;
  /** For the front desk, whole event. Never on the sign. */
  receptionNotes: string | null;
  /** Internal: total cost in euro cents. Never on the sign. */
  costCents: number | null;
  /** Internal: free-text booking number. Never on the sign. */
  bookingNumber: string | null;
  /** Every room the event uses on any day is reserved from here... */
  prepAt: number;
  /** ...until here, when they become free again. */
  releaseAt: number;
  /** Consecutive dates from startDate to endDate. */
  days: EventDay[];
}

/**
 * One booking with its event's public fields: what the sign gets, and what the timeline, the status
 * engine and the conflict check work on. Carries no notes and no labels.
 */
export interface SignEvent {
  /** The booking's id. */
  id: number;
  eventId: number;
  /** The booking's day, 'YYYY-MM-DD'. */
  date: string;
  organizerId: number;
  organizerName: string;
  logoId: number | null;
  title: string;
  subtitle: string | null;
  /** Booked rooms, in display order. */
  roomIds: number[];
  /** The event's reservation span, the same for all its bookings. */
  prepAt: number;
  startAt: number;
  endAt: number;
  releaseAt: number;
  breaks: EventBreak[];
  visible: boolean;
  lowPriority: boolean;
}

export type RoomStatusKind = 'free' | 'occupied' | 'reserved';

export interface Override {
  roomId: number;
  status: RoomStatusKind;
  message: string | null;
  createdAt: number;
  /** Ends at this time, if set. */
  expiresAt: number | null;
  /** Ends when the calculated status next changes. */
  untilNextChange: boolean;
}

export interface Organizer {
  id: number;
  name: string;
  logoIds: number[];
  eventCount: number;
}

/** admin: the programme; media: only the carousel; superadmin: everything. */
export type Role = 'admin' | 'superadmin' | 'media';

export interface SessionUser {
  username: string;
  role: Role;
}

/** Venue-wide settings, set by the superadmin. */
export interface Settings {
  /** Speed of text too long for its space on the sign, in pixels per second on a 1080p screen. */
  marqueeSpeed: number;
  /** Same, for titles that scroll upwards when they don't fit their lines: slower, so they can be read. */
  marqueeVerticalSpeed: number;
  /** Seconds that text waits at its start before scrolling. */
  marqueePause: number;
  /** "HH:MM" when the default preparation starts, on the day before the event. */
  prepTime: string;
  /** Hours: an event starting at least this after the preparation time is prepared the same day. */
  prepMinGapHours: number;
  /** "HH:MM" when the default clean-up ends, after the event. */
  cleanupTime: string;
  /** Hours: an event ending less than this before the clean-up time is cleaned up at the next day's. */
  cleanupMinGapHours: number;
  /** Sign colours: dark between darkFrom and darkUntil ("auto"), or always one of the two. */
  signTheme: 'auto' | 'light' | 'dark';
  darkFrom: string;
  darkUntil: string;
  /** Minutes without contact before the sign shows the small "last update" pill. */
  staleAfterMinutes: number;
  /** Hours without contact before the sign shows the big "Offline" warning. */
  offlineAfterHours: number;
  /** Seconds each image stays up in the carousel shown when no event is planned. */
  carouselImageSeconds: number;
  /** In dark mode, show a dim clock instead of the carousel. */
  nightClock: boolean;
  /** How carousel items fill the screen, unless an item says otherwise. */
  carouselFit: MediaFit;
  /** Main colour ("#rrggbb"); all its lighter and darker shades are derived from it. */
  brandColor: string;
  /** Room status colours; their darker text tones are derived. */
  freeColor: string;
  occupiedColor: string;
  reservedColor: string;
}

export type MediaKind = 'image' | 'video';
/** Fit: whole item visible; fill: stretched to the area; cover: zoomed to fill, edges cropped. */
export type MediaFit = 'contain' | 'fill' | 'cover';

/** An image or video for the carousel the sign shows when no event is planned. */
export interface MediaItem {
  id: number;
  kind: MediaKind;
  name: string;
  mime: string;
  size: number;
}

/** A named, ordered selection of the media library; a sign picks one with ?preset=<name>. */
export interface MediaPreset {
  id: number;
  /** URL slug, `^[a-z0-9-]{1,40}$`. */
  name: string;
  label: string;
  isDefault: boolean;
  /** Seconds per image; null: the global carouselImageSeconds. */
  imageSeconds: number | null;
  /** null: the global carouselFit. */
  fit: MediaFit | null;
  items: {
    mediaId: number;
    /** Disabled items stay in the list but are not shown. */
    enabled: boolean;
    /** Overrides the preset's fit when set. */
    fit: MediaFit | null;
  }[];
}

/**
 * A still image that replaces the sign between `startAt` and `endAt` (GET /api/takeovers/:id/image). `header` and
 * `footer` say whether to show the header and the room strip meanwhile; null follows the screen's own URL.
 */
export interface Takeover {
  id: number;
  name: string;
  startAt: number;
  endAt: number;
  fit: MediaFit;
  header: boolean | null;
  footer: boolean | null;
}

/** Everything the sign needs, from GET /api/display. */
export interface DisplaySnapshot {
  version: string;
  settings: Settings;
  /** Version of the uploaded venue logo (GET /api/venue-logo?v=…), or null for the built-in one. */
  venueLogo: string | null;
  /** The carousel, in order (GET /api/media/:id). */
  media: { id: number; kind: MediaKind; fit: MediaFit | null }[];
  /** The preset `media` comes from, its overrides already resolved against the global settings. */
  mediaPreset: { name: string; isDefault: boolean; imageSeconds: number; fit: MediaFit };
  rooms: Room[];
  events: SignEvent[];
  overrides: Override[];
  /** Takeovers not over yet, upcoming ones included, so the sign switches on time even offline. */
  takeovers: Takeover[];
}

export interface Conflict {
  booking: SignEvent;
  /** Rooms booked by both. */
  roomIds: number[];
}
