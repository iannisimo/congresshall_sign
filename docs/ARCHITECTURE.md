# Architecture

Technical design for the rewrite. Requirement IDs (SIGN-1, ROOM-2, …) refer to the README.

## Stack

| Part | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere, one npm package | Shared code (status logic, schemas) without a monorepo tool |
| Server | Node ≥ 22.18 running `.ts` directly (type stripping), [Hono](https://hono.dev) | No server build step; small, typed, modern framework |
| Database | SQLite through Node's built-in `node:sqlite` | Single file, no native module to compile, easy backup (OPS-2) |
| Validation | zod, schemas shared by client and server | One definition of a valid event (ADMIN-6) |
| Images | sharp | Checks and shrinks uploaded logos (ADMIN-11) |
| Web | React 19, Vite, Tailwind CSS 4, react-router, TanStack Query (admin only) | Same family as before, current versions |
| Offline | vite-plugin-pwa (Workbox) | Precached app shell, logo cache, self-update (SYNC-2, SIGN-6) |
| Tests | vitest | Status logic, schemas, API (OPS-5) |

Server code must use only *erasable* TypeScript (no `enum`, no parameter properties) and import
relative files with their `.ts` extension, because Node strips types without compiling.

## Layout

```
src/
  shared/      pure TypeScript used by both sides: types, zod schemas, status engine, conflicts, time helpers
  server/      Hono app, SQLite repositories, auth, image processing, CLI
  web/         React app: the sign (/) and the admin area (/admin)
docs/          plan and design
```

## Data model (SQLite)

All times are stored as integer milliseconds since the epoch (UTC). Day boundaries are calculated in the
server's time zone (`TZ`, `Europe/Rome` in the container).

- **rooms**: `id`, `name`, `kind` (`main` | `sub`), `sort_order`, `blocked_message` (shown on a sub-room
  while a parent room is in use).
- **room_parents**: `room_id`, `parent_id`. Links a sub-room to the main rooms it belongs to.
- **organizers**: `id`, `name` (unique, case-insensitive).
- **logos**: `id`, `organizer_id`, `mime`, `data` (normalized PNG), `width`, `height`, `created_at`.
- **events**: `id`, `organizer_id`, `logo_id?`, `title`, `subtitle?`, `visible`, `reception_notes?`
  (whole event), `cost_cents?` (internal, euro cents), `booking_number?` (internal, free text, max 60), `start_date`, `end_date` (`'YYYY-MM-DD'`, local), `prep_at`, `release_at` (all the event's rooms are
  reserved in `[prep_at, release_at)`, `prep_at ≤ release_at`), `created_at`, `updated_at`.
- **event_days**: `id`, `event_id` (cascade), `date`, `reception_notes?`, `housekeeping_notes?`, `restaurant_notes?`,
  unique `(event_id, date)`. One row per date from `start_date` to `end_date`, no gaps; a day may have no
  bookings. A `NULL` note (reception, housekeeping, restaurant) on a day after the first means "same as the previous day"; `—` means nothing.
- **event_bookings**: `id`, `day_id` (cascade), `label?` (internal), `start_at`, `end_at`. Rules:
  `start_at < end_at`, `start_at` on the day's date, and for the event `prep_at ≤` every `start_at`,
  `release_at ≥` every `end_at` (checked by the schema).
- **event_booking_rooms**: `booking_id` (cascade), `room_id`, `position`.
- **event_booking_breaks**: `booking_id` (cascade), `label`, `start_at`, `end_at`. Pauses inside
  `[start_at, end_at)`, not overlapping; the room stays occupied during them.

  Saving an event replaces all its days and bookings in one transaction: the event id is stable (ADMIN-9),
  booking ids are not. The notes and labels are for the venue staff: the sign gets `SignEvent`s, one per
  booking, built by `flattenEvents` (`src/shared/events.ts`), which don't carry them (nor the cost and booking number) and give every booking
  the event's `prep_at`/`release_at`.
- **overrides**: `room_id` (one per room), `status`, `message?`, `created_at`, `expires_at?`,
  `until_next_change`.
- **media**: the library. `id`, `kind` (`image` | `video`), `name`, `mime`, `file`, `size`, upload date.
  The files are in `DATA_DIR/media` under random names and never change, so they are cached forever.
- **media_presets**: `id`, `name` (URL slug, `^[a-z0-9-]{1,40}$`, unique), `label`, `sort_order`,
  `image_seconds?` and `fit?` (null = the global `carouselImageSeconds` / `carouselFit`), `is_default`
  (exactly one row, enforced by a partial unique index).
- **media_preset_items**: `preset_id`, `media_id` (both cascade), `position`, `enabled`, `fit?` (null = the
  preset's fit). Primary key `(preset_id, media_id)`.
- **id_sequences**: `name` (`logos` | `media`), `next`. Logos and media are cached forever under their id,
  so a deleted id must never be given out again (SQLite would reuse the highest one): inserts take `next`,
  and triggers keep it ahead of every id used.
- **settings**: `key`, `value` (JSON). The full list and the defaults are in `src/shared/settings.ts`
  (scrolling, theme, offline warnings, carousel, colours, and `prepTime`, `cleanupTime`,
  `cleanupMinGapHours` for the default margins). A missing or invalid value uses its default; a value
  saved under the old `changeoverTime` key is used for both `prepTime` and `cleanupTime`.
- **users**: `username` (`admin` | `superadmin` | `media`), `password_hash?`, `password_changed_at`.
- **sessions**: `token_hash`, `username`, `created_at`, `expires_at`.

Migrations are a list of SQL scripts applied in order, tracked with `PRAGMA user_version`. Migration 9
moves the carousel's order, switches and fit from `media` to the default preset (nothing is lost).
Migration 10 introduces days and bookings and **drops the existing events** instead of converting them
(decision 17); organizers, logos and rooms stay.

## Room status (ROOM-1 … ROOM-4)

One pure function, `computeRoomStatuses(rooms, events, overrides, now)` in `src/shared/status.ts`, used
by the sign, the admin area and the tests. It works on `SignEvent[]`, i.e. on room **bookings** with their
event's public fields (`eventId`, `date`); "event" below means such a booking.

For each room, with only **visible** events taken into account:

1. **Own events** (the room is booked by the event):
   - `prep_at ≤ now < start_at` → **reserved** (preparation; `prep_at` and `release_at` are the event's, so
     a room used only on day 3 is reserved from the event's preparation, and one used only on day 1 stays
     reserved until the event's release)
   - `start_at ≤ now < end_at` → **occupied**
   - `end_at ≤ now < release_at` → **reserved** (clean-up)
2. **Parent events** (an event running in one of the room's parent rooms, `start_at ≤ now < end_at`) →
   **reserved**, with the room's `blocked_message`.
3. The strongest result wins: occupied > reserved > free. Between two reserved results, the room's own
   event wins over a parent's.
4. An **active override** replaces the result. An override is active from `created_at` until whichever
   comes first:
   - `expires_at`, if set
   - with `until_next_change`, the first status boundary (any of the times above, for the room's own
     events and its parents' events) after `created_at`. This is checked at the time of display, so it
     also works for events created after the override.

The function also returns, for each room, the time of its next change, which the sign shows as "→ 4:30 PM".

Because the result depends only on data the sign already has and the clock, the sign keeps changing
statuses at the right times while offline (SYNC-3), and the server needs no timers.

## Sync protocol (SYNC-1)

`GET /api/display` (public) returns:

```json
{ "version": "build id", "settings": {...}, "venueLogo": "version or null", "rooms": [...], "events": [...], "overrides": [...] }
```

- Events: the bookings of visible events overlapping `[start of today, start of today + 8 days)`,
  flattened (`SignEvent[]`, one per booking). The body therefore only changes when data changes or the day
  changes.
- `?preset=<name>` selects the carousel: `media` holds the enabled items of that preset (or of the default
  one when the name is missing or unknown), and `mediaPreset` (`name`, `isDefault`, `imageSeconds`, `fit`)
  its settings with the overrides already resolved against the global ones. The ETag follows the body, so
  it differs by preset.
- The response has a strong `ETag` (hash of the body). The sign sends `If-None-Match` and gets
  `304 Not Modified` when nothing changed.
- The sign polls every 60 s, and immediately when the browser comes back online.
- The `Date` header of every response (200 or 304) gives the server time, which the sign uses to correct
  its clock (SIGN-7).
- The last snapshot, its ETag and when it was received are stored in `localStorage`, under keys suffixed
  with the preset (`…:bar`; none for the default, so existing screens keep theirs). On start, the sign
  draws from the snapshot first, then polls.
- If `version` differs from the version built into the page, the sign updates its service worker and
  reloads (SIGN-6). A guard stops reload loops.

## API

All under `/api`, JSON unless stated otherwise. 🔓 public · 🔑 admin or superadmin · 🖼️ media or superadmin · 👤 any account · 👑 superadmin.

| Method & path | | Purpose |
|---|---|---|
| `GET /health` | 🔓 | Liveness check |
| `GET /display` | 🔓 | Sign snapshot (see above); `?preset=` picks the carousel |
| `GET /logos/:id` | 🔓 | Logo image, cached forever (logos never change) |
| `POST /auth/login` | 🔓 | `{username, password}`, sets the session cookie |
| `POST /auth/logout` | 👤 | Ends the session |
| `GET /auth/me` | 👤 | `{username, role}` |
| `GET /events?from=&to=` | 🔑 | Whole events, hidden ones included, for which a booking holds a room in `[from, to)` or a day's date falls in it; `to` is optional. Ordered by start date, first start, id |
| `GET /events/:id` | 🔑 | One event with its days and bookings |
| `POST /events` | 🔑 | `{event: EventInput, allowConflicts?}`. Creates one (multi-day) event (ADMIN-8) |
| `PUT /events/:id` | 🔑 | `{event: EventInput, allowConflicts?}`. Edits in place, replacing days and bookings (ADMIN-9) |
| `DELETE /events/:id` | 🔑 | With all its days |
| `GET /organizers` | 🔑 | Organizers with their logo ids and event counts |
| `POST /organizers` | 🔑 | `{name}` |
| `PATCH /organizers/:id` | 🔑 | `{name}`. Rename |
| `DELETE /organizers/:id` | 🔑 | Only when no event uses it |
| `POST /organizers/:id/logos` | 🔑 | Multipart `file`, JSON `{url}` fetched by the server, or `{generic}` to copy an emblem; optional `crop` `{left, top, size}` (fractions of the image, multipart field as JSON) |
| `DELETE /logos/:id` | 🔑 | 409 when an event uses it |
| `GET /generic-logos`, `GET /generic-logos/:id` | 🔑 | Generic emblems, listed and as SVG for previews |
| `GET /rooms` | 🔑 | Rooms with parents |
| `POST /rooms`, `PUT /rooms/:id`, `DELETE /rooms/:id` | 👑 | Room management (ROOM-5) |
| `PUT /rooms/order` | 👑 | `{ids}`. Display order |
| `PUT /rooms/:id/override` | 🔑 | `{status, message?, until}`. `until` is `next-change`, `{at}` or `manual` |
| `DELETE /rooms/:id/override` | 🔑 | Back to the calculated status |
| `GET /venue-logo` | 🔓 | The uploaded venue logo (SVG, strict CSP); `?v=` versions are cached forever |
| `PUT /venue-logo`, `DELETE /venue-logo` | 👑 | Upload an SVG (multipart `file`, max 1 MB, no scripts), or go back to the built-in logo |
| `GET /media` | 🖼️ | The library, newest first |
| `GET /media/:id` | 🔓 | The file, with Range support (video playback) |
| `POST /media` | 🖼️ | Raw file as the body, `Content-Type` and `X-File-Name`; streamed to disk. Images (max 30 MB) shrunk to Full HD; MP4/WebM videos (max 500 MB) kept as they are. `X-Preset-Id` adds it, enabled and last, to that preset; otherwise to the default one |
| `DELETE /media/:id` | 🖼️ | Deletes the file; it leaves every preset |
| `GET /media-presets` | 🖼️ | Presets with their items, default first, then by `sort_order` |
| `POST /media-presets` | 🖼️ | `{name, label, copyFrom?}`. Empty, or a copy of another preset's items |
| `PATCH /media-presets/:id` | 🖼️ | `{name?, label?, imageSeconds?, fit?}`; the default's name can't change (409) |
| `PUT /media-presets/:id/items` | 🖼️ | `{items: {mediaId, enabled, fit}[]}`: the whole ordered list (add, remove, reorder, switch in one call) |
| `PUT /media-presets/:id/default` | 🖼️ | Makes it the default preset |
| `DELETE /media-presets/:id` | 🖼️ | 409 for the default one |
| `GET /settings` | 👤 | Sign settings (the admin preview uses them too) |
| `PUT /settings` | 👑 | Every key of `Settings` (`src/shared/model.ts`) |
| `PUT /settings/carousel` | 🖼️ | `{carouselImageSeconds, carouselFit}` only |

Saving events checks for **conflicts**: a booking running in the same room at the same time as a booking of
*another* event (overlapping `[start_at, end_at)`, drafts included; `findConflicts` skips the candidate's own
`eventId`). Bookings of the same event can't share a room at overlapping times: the shared schema rejects
that, together with gaps or repeated days, a booking off its day and an event without bookings. Preparation and clean-up don't count (they are the event's): the default ones span about a
day and routinely overlap neighbouring events, and the status rules already resolve that (occupied beats
reserved). The server answers 409 with `conflicts: {date, bookingIndex, conflicts}[]` (the `Conflict`s of
each booking) unless `allowConflicts` is true (ADMIN-7). The admin area runs the same shared check while the form is edited.

## Auth (AUTH-1 … AUTH-3)

- The `admin`, `superadmin` and `media` users always exist; `media` only sees the Media page. A user without a password can't log in.
- `npm run passwd -- <user>` (or `node src/server/cli.ts passwd <user>` in the container) sets the
  password and deletes that user's sessions.
- Passwords are hashed with Node's built-in `scrypt`.
- Sessions: a random token in an `HttpOnly`, `SameSite=Strict` cookie. Only its SHA-256 hash is stored.
  The cookie lasts 30 days (configurable) and is renewed at most once a day while in use (sliding expiry).
- `Secure` cookies: automatic behind HTTPS when `TRUST_PROXY=true` (reads `X-Forwarded-Proto`).
- Changes are only accepted as JSON or multipart with the same origin (Hono `csrf` middleware), on top
  of `SameSite=Strict`.

## Web app

- `/`: the sign. Lightweight bundle. The admin code is split into its own lazily loaded chunk.
- `/admin/*`: the admin area. The programme page shows a week, one day under the other (timeline and
  event list per day, one row per event with a line per booking), and scrolls to the selected day (`?d=`),
  so the editor returns where it started. Italian wording, like the old app. It uses TanStack Query against
  the API. `useEvents` returns whole `ScheduledEvent`s; the timeline, calendar and status work on
  `flattenEvents(...)`.
- Editor: `/admin/events/:id?day=YYYY-MM-DD&d=…`, one tab per day (`EventEditor.tsx`, `DayTab.tsx`,
  `BookingFields.tsx`); `day` selects the tab (default: today's if the event runs today, else the first),
  `d` is where "back" returns. Zod issue paths (`days.2.bookings.0.roomIds`) mark the tab and booking.
  `/admin/events/:id/clone` copies all days; changing the start date shifts them (`shiftEvent`).
- Events list (`/admin/events`, `EventList.tsx`) and prints: `printSheet` (`DayPrint.tsx`) renders a sheet
  and calls `window.print()`; `RestaurantPrint.tsx` (rows built by the pure `restaurantRows.ts`) and
  `EventsPrint.tsx` use it. Day notes are always resolved with `effectiveDayNotes`.
- Media page: a preset bar (the selected preset is in `?preset=`), the preset's settings and sign URL, its
  items (drag to reorder) and the library items not in it.
- The sign's sizes are in `rem`, with the root font size tied to the viewport height, so a 16:9 screen
  of any resolution looks the same (SIGN-3).
- Dark mode (SIGN-9): `html.sign-dark` redefines the colour variables the Tailwind utilities read
  (`src/web/styles.css`), so components need no dark-specific classes. `useSignTheme` picks the theme:
  `?mode=` in the URL, then the `signTheme` setting, then `darkFrom`–`darkUntil` on the corrected clock.
  Organizer logos keep a white tile; the single-colour venue logo is turned white.
- The sign's wording lives in one file, `src/web/sign/strings.ts` (SIGN-4).
- What goes where on the sign is a pure function, `buildSignView` in `src/web/sign/schedule.ts`: big cards
  for today's running and upcoming events (or the next day with events), and a compact list of the
  following 3 days, where the bookings of one event on one day are merged into one line (earliest start,
  rooms in display order). Cards rotate in pages when they don't fit. With one or two bookings on that
  day (`HERO_MAX = 2` counts bookings, not events), `HeroCard` (`EventCard.tsx`) takes the place of the cards and fills the column (SIGN-12).
- Long texts scroll with `Marquee` (`src/web/sign/Marquee.tsx`, SIGN-8), built on the Web Animations API:
  a pause at the start, then the text moves left until a copy of it takes its place, so the loop has no
  jump. The speed is in pixels per second on a 1080p sign and scales with the rem, so it looks the same on
  every resolution. Each scrolling text reports its cycle length, and a page of cards stays up until the
  longest one has finished (at least 12 s). Browsers without the API cut the text with an ellipsis.
  `FitText` (same file) is the multi-line version used by `HeroCard`: the text wraps within a set number
  of lines at the largest size, shrinks in steps down to a minimum, and past that scrolls upwards the same
  way, at its own speed (`marqueeVerticalSpeed`).
- Carousel (SIGN-11): `Carousel` in `src/web/sign/Carousel.tsx`, using the duration and fit of
  `snapshot.mediaPreset`; `/carousel` names the preset in its "no media" message when it isn't the default.
  The sign downloads every item of its preset in the background so the service worker caches it whole; videos then play from the cache with range requests,
  offline included.
- Service worker updates: the sign installs a new version as soon as it's ready. The admin area shows an
  "Aggiorna" banner instead, so a half-filled form is never lost.
- Browsers only run service workers (and screen wake lock) in a secure context: HTTPS or `localhost`. The
  kiosk either reaches the server over HTTPS or starts Chromium with
  `--unsafely-treat-insecure-origin-as-secure` (see the README).

## Decisions taken while the requirements owner was away

These are assumptions. Each one is easy to change.

1. **Only main rooms can be booked by events.** Sub-rooms get their status from their parent rooms and
   from overrides, as in the old app.
2. **Hidden events are drafts.** They don't appear on the sign and don't affect room status, as in the
   old app. They still count for conflict warnings in the admin area.
3. **Preparation and clean-up** are per event, not per booking: every room the event uses is reserved for
   the whole span, even on days it isn't booked. They are stored as absolute times. The form offers the two usual congress
   set-ups (from the preparation time of the day before to the next clean-up time after the end, see
   `changeoverMargins` in `src/shared/time.ts`; or none), plus custom times. Clean-up stays on the same day
   only if the event ends at least `cleanupMinGapHours` before the clean-up time. Both times and the gap
   are superadmin settings; changing them only affects events saved afterwards.
4. **Sign wording:** English words that most Italians know or that look alike in Italian ("Free",
   "Occupied", "Reserved", "Now", "Next"), dates like `Sat 17 Oct`, the 12-hour clock, and symbols where
   possible (`→ 4:30 PM`).
5. **The admin area is in Italian**, like the old one, since one Italian-speaking person uses it.
6. **Logos are stored as PNG,** at most 512 px on the longest side. PNG rather than WebP for older
   smart-TV browsers. SVG uploads are turned into PNG, which also removes the risk of scripts inside SVG.
   With a crop from the admin dialog (`LogoCropper.tsx`) the server keeps that square, padding with
   transparency where it reaches past the image; without one it trims uniform borders. The sign's `Logo`
   tile keeps a white margin around every logo, so its rounded corners never cut into one.
7. **Logo by URL:** the server fetches the image itself (admin only, http/https, 10 s timeout, 10 MB
   limit) instead of going through corsproxy.io.
8. **No venue name on the sign:** the header shows the venue logo on the left and the clock on the right;
   a name would break the mostly-English wording.
9. **Data from the old app** can be brought over with an import command that reads `mongoexport` files.
   The old app had no clean-up time, so imported events get the default 30 minutes.
10. **Rooms in an event follow the display order**, not the order they were clicked.
11. **"Until next change" overrides** end when the calculated status changes cause (a different event or
    phase), not merely its look. Overrides that no longer apply are deleted by the server when it builds
    the sign's snapshot.
12. **Sessions** are stored server-side (revocable) rather than as JWTs.

Multi-day events and media presets:

13. **Event, day, booking.** An event has consecutive days (a day may be empty); a day has room bookings
    (several, in different rooms and times); breaks belong to a booking. Booking ids change at every save.
14. **Notes.** Housekeeping (including room preparation) and reception per day, plus reception for the
    whole event; no event-level housekeeping and no separate set-up note. On days after the first, a
    `NULL` note means "same as the previous day" (resolved recursively by `effectiveDayNotes`); `—` means
    nothing. The prints show the inherited text.
15. **Sign.** One featured card per booking (a morning and an afternoon booking of one congress make two
    cards with the same title; hero mode counts bookings); the coming-up list merges bookings per event
    and day.
16. **Prints.** The restaurant print covers today plus 13 days, ignores the list filters, includes drafts
    marked "DA CONFERMARE" and merges breaks per day; the day sheet still leaves drafts out. The detailed
    print takes the events shown in the list (filtered), one row's event, or the editor's saved event
    (unsaved changes aren't printed).
17. **No legacy data.** The app hadn't been used in production, so migration 10 drops the events, and
    `delete-events` empties them from the command line.
18. **Media presets.** Each preset has its own order, switches and fit per item, plus optional image
    duration and fit. An unknown `?preset=` silently falls back to the default; the admin page shows each
    preset's URL. The default preset can't be deleted and its name can't change.

## Command line

`node src/server/cli.ts <command>` (or `npm run cli -- <command>` in development):

- `passwd <admin|superadmin>`: set a password; logs that user out everywhere.
- `backup <file>`: consistent copy of the database (`VACUUM INTO`), also while the server runs.
- `import-mongo <dir>`: import `rooms.json`, `events.json`, `logos.json` from the old app into an empty
  database (each event becomes a one-day event with one booking).
- `delete-events [--yes]`: delete every event with its days, bookings and breaks in one transaction;
  organizers, logos, rooms, media and settings stay. Without `--yes` it only counts. Run `backup` first.
