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
- **events**: `id`, `organizer_id`, `logo_id?`, `title`, `subtitle?`, `prep_at`, `start_at`, `end_at`,
  `release_at`, `visible`, `created_at`, `updated_at`.
  Rule: `prep_at ≤ start_at < end_at ≤ release_at`.
- **event_rooms**: `event_id`, `room_id`, `position`.
- **event_breaks**: `event_id`, `label`, `start_at`, `end_at`. Pauses inside `[start_at, end_at)`, not
  overlapping; the room stays occupied during them.
- **overrides**: `room_id` (one per room), `status`, `message?`, `created_at`, `expires_at?`,
  `until_next_change`.
- **settings**: `key`, `value` (JSON). `marqueeSpeed`, `marqueePause` (sign) and `changeoverTime` (default
  margins); a missing or
  invalid value uses its default from `src/shared/settings.ts`.
- **users**: `username` (`admin` | `superadmin`), `password_hash?`, `password_changed_at`.
- **sessions**: `token_hash`, `username`, `created_at`, `expires_at`.

Migrations are a list of SQL scripts applied in order, tracked with `PRAGMA user_version`.

## Room status (ROOM-1 … ROOM-4)

One pure function, `computeRoomStatuses(rooms, events, overrides, now)` in `src/shared/status.ts`, used
by the sign, the admin area and the tests.

For each room, with only **visible** events taken into account:

1. **Own events** (the room is booked by the event):
   - `prep_at ≤ now < start_at` → **reserved** (preparation)
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
{ "version": "build id", "settings": {...}, "rooms": [...], "events": [...], "overrides": [...] }
```

- Events: visible events overlapping `[start of today, start of today + 8 days)`. The body therefore only
  changes when data changes or the day changes.
- The response has a strong `ETag` (hash of the body). The sign sends `If-None-Match` and gets
  `304 Not Modified` when nothing changed.
- The sign polls every 60 s, and immediately when the browser comes back online.
- The `Date` header of every response (200 or 304) gives the server time, which the sign uses to correct
  its clock (SIGN-7).
- The last snapshot, its ETag and when it was received are stored in `localStorage`. On start, the sign
  draws from the snapshot first, then polls.
- If `version` differs from the version built into the page, the sign updates its service worker and
  reloads (SIGN-6). A guard stops reload loops.

## API

All under `/api`, JSON unless stated otherwise. 🔓 public · 🔑 admin or superadmin · 👑 superadmin.

| Method & path | | Purpose |
|---|---|---|
| `GET /health` | 🔓 | Liveness check |
| `GET /display` | 🔓 | Sign snapshot (see above) |
| `GET /logos/:id` | 🔓 | Logo image, cached forever (logos never change) |
| `POST /auth/login` | 🔓 | `{username, password}`, sets the session cookie |
| `POST /auth/logout` | 🔑 | Ends the session |
| `GET /auth/me` | 🔑 | `{username, role}` |
| `GET /events?from=&to=` | 🔑 | All events, hidden ones included, overlapping the range |
| `GET /events/:id` | 🔑 | One event |
| `POST /events` | 🔑 | `{events: EventInput[], allowConflicts?}`. Creates one or more events in one transaction (ADMIN-8) |
| `PUT /events/:id` | 🔑 | `{event: EventInput, allowConflicts?}`. Edits in place (ADMIN-9) |
| `DELETE /events/:id` | 🔑 | |
| `GET /organizers` | 🔑 | Organizers with their logo ids and event counts |
| `POST /organizers` | 🔑 | `{name}` |
| `PATCH /organizers/:id` | 🔑 | `{name}`. Rename |
| `DELETE /organizers/:id` | 🔑 | Only when no event uses it |
| `POST /organizers/:id/logos` | 🔑 | Multipart `file`, JSON `{url}` fetched by the server, or `{generic}` to copy an emblem |
| `DELETE /logos/:id` | 🔑 | 409 when an event uses it |
| `GET /generic-logos`, `GET /generic-logos/:id` | 🔑 | Generic emblems, listed and as SVG for previews |
| `GET /rooms` | 🔑 | Rooms with parents |
| `POST /rooms`, `PUT /rooms/:id`, `DELETE /rooms/:id` | 👑 | Room management (ROOM-5) |
| `PUT /rooms/order` | 👑 | `{ids}`. Display order |
| `PUT /rooms/:id/override` | 🔑 | `{status, message?, until}`. `until` is `next-change`, `{at}` or `manual` |
| `DELETE /rooms/:id/override` | 🔑 | Back to the calculated status |
| `GET /settings` | 🔑 | Sign settings (the admin preview uses them too) |
| `PUT /settings` | 👑 | `{marqueeSpeed, marqueePause, changeoverTime}` |

Saving events checks for **conflicts**: another event running in the same room at the same time
(overlapping `[start_at, end_at)`). Preparation and clean-up don't count: the default ones span about a
day and routinely overlap neighbouring events, and the status rules already resolve that (occupied beats
reserved). The server answers 409 with the list of conflicts unless
`allowConflicts` is true (ADMIN-7). The admin area runs the same shared check while the form is edited.

## Auth (AUTH-1 … AUTH-3)

- The `admin` and `superadmin` users always exist. A user without a password can't log in.
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
  event list per day), and scrolls to the selected day (`?d=`), so the editor returns where it started. Italian wording, like the old app. It uses TanStack Query against the API.
- The sign's sizes are in `rem`, with the root font size tied to the viewport height, so a 16:9 screen
  of any resolution looks the same (SIGN-3).
- Dark mode (SIGN-9): `html.sign-dark` redefines the colour variables the Tailwind utilities read
  (`src/web/styles.css`), so components need no dark-specific classes. `useSignTheme` picks the theme:
  `?mode=` in the URL, then the `signTheme` setting, then `darkFrom`–`darkUntil` on the corrected clock.
  Organizer logos keep a white tile; the single-colour venue logo is turned white.
- The sign's wording lives in one file, `src/web/sign/strings.ts` (SIGN-4).
- What goes where on the sign is a pure function, `buildSignView` in `src/web/sign/schedule.ts`: big cards
  for today's running and upcoming events (or the next day with events), and a compact list of the
  following 3 days. Cards rotate in pages when they don't fit.
- Long texts scroll with `Marquee` (`src/web/sign/Marquee.tsx`, SIGN-8), built on the Web Animations API:
  a pause at the start, then the text moves left until a copy of it takes its place, so the loop has no
  jump. The speed is in pixels per second on a 1080p sign and scales with the rem, so it looks the same on
  every resolution. Each scrolling text reports its cycle length, and a page of cards stays up until the
  longest one has finished (at least 12 s). Browsers without the API cut the text with an ellipsis.
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
3. **Preparation and clean-up** are stored as absolute times. The form offers the two usual congress
   set-ups (from the changeover time of the day before to the next changeover after the end, see
   `changeoverMargins` in `src/shared/time.ts`; or none), plus custom times. The changeover time is a
   superadmin setting (default 14:00); changing it only affects events saved afterwards.
4. **Sign wording:** English words that most Italians know or that look alike in Italian ("Free",
   "Occupied", "Reserved", "Now", "Next"), dates like `Sat 17 Oct`, the 12-hour clock, and symbols where
   possible (`→ 4:30 PM`).
5. **The admin area is in Italian**, like the old one, since one Italian-speaking person uses it.
6. **Logos are stored as PNG,** at most 512 px on the longest side. PNG rather than WebP for older
   smart-TV browsers. SVG uploads are turned into PNG, which also removes the risk of scripts inside SVG.
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

## Command line

`node src/server/cli.ts <command>` (or `npm run cli -- <command>` in development):

- `passwd <admin|superadmin>`: set a password; logs that user out everywhere.
- `backup <file>`: consistent copy of the database (`VACUUM INTO`), also while the server runs.
- `import-mongo <dir>`: import `rooms.json`, `events.json`, `logos.json` from the old app into an empty
  database.
