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

export interface ScheduledEvent {
  id: number;
  organizerId: number;
  organizerName: string;
  logoId: number | null;
  title: string;
  subtitle: string | null;
  /** Booked rooms, in display order. */
  roomIds: number[];
  /** The room is reserved from here... */
  prepAt: number;
  startAt: number;
  endAt: number;
  /** ...until here, when it becomes free again. */
  releaseAt: number;
  /** Hidden events are drafts: not on the sign and no effect on room status. */
  visible: boolean;
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

export type Role = 'admin' | 'superadmin';

export interface SessionUser {
  username: string;
  role: Role;
}

/** Venue-wide settings, set by the superadmin. */
export interface Settings {
  /** Speed of text too long for its space on the sign, in pixels per second on a 1080p screen. */
  marqueeSpeed: number;
  /** Seconds that text waits at its start before scrolling. */
  marqueePause: number;
  /** "HH:MM" when rooms change hands: default preparation starts and clean-up ends then. */
  changeoverTime: string;
}

/** Everything the sign needs, from GET /api/display. */
export interface DisplaySnapshot {
  version: string;
  venueName: string;
  settings: Settings;
  rooms: Room[];
  events: ScheduledEvent[];
  overrides: Override[];
}

export interface Conflict {
  event: ScheduledEvent;
  /** Rooms booked by both events. */
  roomIds: number[];
}
