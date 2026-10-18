Congress-Hall Sign Manager
===

Web app that shows the schedule of a congress centre and the live status of its rooms on a single
screen (the *sign*), plus an admin area to manage events, organizers, logos and rooms.

> The project is being rewritten on the `rework` branch.
> Plan and progress: [docs/PLAN.md](docs/PLAN.md) · Technical design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

Requirements
------------

Target setup: **one screen**, driven by a **Raspberry Pi** running a browser in kiosk mode. It may later
become a smart-TV browser. **One person** does the admin work.

### Sign (public display)

- **SIGN-1** Calm, modern look, readable from across the room, without the train-timetable feel. What is
  happening now and next gets the most space, and organizer logos are large.
- **SIGN-2** The room status strip is always visible.
- **SIGN-3** The layout scales with the screen. Style choices assume a 16:9 landscape screen.
- **SIGN-4** Wording, dates and symbols are as universal as possible, so they are easy to understand for
  both English and Italian speakers. The 12-hour clock with AM/PM is deliberate, for the same reason.
- **SIGN-5** Runs unattended: no mouse cursor, no interaction needed, recovers from errors by itself.
- **SIGN-6** Updates and reloads itself when a new version is deployed.
- **SIGN-7** The clock is corrected using the server's time.
- **SIGN-10** The logo in the header is the venue's own SVG, uploaded by the superadmin (the built-in logo
  otherwise).
- **SIGN-9** Dark colours at night (20:00–07:00 by default). The superadmin can change the hours or force
  light or dark; a single screen can force its own with `?mode=dark` or `?mode=light` in its URL.
- **SIGN-8** Text too long for its space scrolls instead of being cut: titles and subtitles of the event
  cards, and the title and "organizer · rooms" line in the "Coming up" list. It waits at its start, then
  scrolls until it starts again. The superadmin sets the speed and the pause. A page of cards stays up
  until its texts have scrolled through.

### Data sync and offline

- **SYNC-1** The sign polls the server every minute, and the server answers "not modified" when nothing
  changed. This replaces the WebSocket push.
- **SYNC-2** A service worker caches the app and the logos, and the last data received is stored on the
  device, so the sign starts and keeps working while offline.
- **SYNC-3** Room statuses keep changing at the right times while offline (see ROOM-1).
- **SYNC-4** When the data is out of date, a small "last update" note is shown in the top-right corner
  (after 3 minutes without contact). After 72 hours, a big "Offline" warning with the time of the last
  update is shown. The superadmin can change both delays.

### Rooms and status

- **ROOM-1** Room status (free, occupied, reserved) is calculated from the events, the manual overrides
  and the current time, by the same code on the server and in the browser.
- **ROOM-2** Event lifecycle for each room: reserved from the start of preparation, occupied from start
  to end, reserved during clean-up, then free again on its own. The preparation start and the clean-up
  time are set on each event.
- **ROOM-3** Sub-rooms show as reserved, with their own message, while an event is running in one of
  their parent rooms.
- **ROOM-4** Manual overrides: the admin can force a room's status, with an optional message, until the
  next scheduled change, until a given time, or until cleared.
- **ROOM-5** The superadmin manages rooms (name, order, main or sub, parent rooms, message) from the
  admin area.

### Admin

- **ADMIN-1** Separate admin area at `/admin`, usable on desktop, tablet and phone.
- **ADMIN-2** Weekly programme (Monday to Sunday): for each day, a timeline of the rooms showing
  preparation, event and clean-up, and the list of that day's events.
- **ADMIN-3** Event form with defaults for the two usual set-ups: the room is reserved from the changeover
  time (14:00, set by the superadmin) of the day before until the next changeover after the end (the same
  day if it ends earlier), or there is no preparation and clean-up at all. Custom times are still possible. With the first set-up, the days of a
  congress keep the room reserved in between.
- **ADMIN-4** Live preview of how the event will look on the sign.
- **ADMIN-5** Keyboard shortcuts in date fields: `o` for today (*oggi*), `d` for tomorrow (*domani*).
- **ADMIN-6** Times are checked (preparation ≤ start < end ≤ free again) in both the browser and the
  server.
- **ADMIN-7** Warning when two events run in the same room at the same time. Saving anyway needs
  confirmation. Overlapping preparation and clean-up are normal and don't warn.
- **ADMIN-8** Multi-day congresses: create the same event on several days at once, and clone existing
  events.
- **ADMIN-9** Events are edited in place and keep their identity.
- **ADMIN-12** Breaks inside an event (presets: Break, Coffee break, Lunch break, or any name). While the
  event is live, its card on the sign shows the break under way, or else the next one.
- **ADMIN-10** Logo library for each organizer: upload (file, drag and drop, paste), preview and
  delete. Organizers can be renamed. Choosing an organizer preselects its first logo. A set of generic
  emblems (university, medicine, technology, associations…) is available for organizers without a logo.
- **ADMIN-11** Uploaded logos are checked (type and size) and shrunk by the server. No third-party
  proxies.

### Accounts

- **AUTH-1** Two predefined accounts: `admin` (events, organizers, logos, overrides) and `superadmin`
  (everything, plus rooms and settings). There is no sign-up.
- **AUTH-2** Passwords are set and changed from the command line. Changing a password logs that account
  out everywhere.
- **AUTH-3** Long sessions, renewed silently while in use.

### Operations and quality

- **OPS-1** One container serves both the API and the web app.
- **OPS-2** SQLite database (a single file, easy to back up) instead of MongoDB.
- **OPS-3** No database admin UI exposed in production. Works behind an HTTPS reverse proxy.
- **OPS-4** Configuration is checked at startup, with clear errors.
- **OPS-5** Automated tests for the room-status logic.

### Later

- **TODO** Announcement banner on the sign (ideas pending).

Development
-----------

Needs Node.js 22.18 or later (the server runs its TypeScript directly). `nix develop` or direnv provides it.

```sh
npm install
npm run passwd -- superadmin   # and: npm run passwd -- admin
npm run dev                    # API on :3000, web app on http://localhost:5173
```

The sign is at `/` and the admin area at `/admin`.

```sh
npm test            # status logic, schemas, API
npm run typecheck
npm run build       # web app into dist/web; `npm start` then serves everything on :3000
```

Code layout: `src/shared` (status logic, schemas, types used by both sides), `src/server` (API, SQLite,
CLI), `src/web/sign` (the sign), `src/web/admin` (the admin area).

Deployment
----------

```sh
docker compose up -d --build
docker compose exec app node src/server/cli.ts passwd superadmin
docker compose exec app node src/server/cli.ts passwd admin
```

The sign is at `http://<server>:8080/` and the admin area at `http://<server>:8080/admin`. A redeploy
reaches the sign by itself within a minute.

| Variable | Default | |
|---|---|---|
| `TRUST_PROXY` | `false` | Set to `true` behind a reverse proxy (HTTPS) |
| `COOKIE_SECURE` | `auto` | `auto` uses secure cookies when the request came over HTTPS |
| `SESSION_DAYS` | `30` | Admin sessions end after this many days without use |
| `PORT`, `DATA_DIR`, `WEB_DIR` | `3000`, `/data`, `/app/dist/web` | Already set in the image |

**HTTPS:** put any reverse proxy in front (for example Caddy: `reverse_proxy app:3000`) and set
`TRUST_PROXY=true`.

**Backups:** the whole database is one SQLite file in the `data` volume. To copy it while running:

```sh
docker compose exec app node src/server/cli.ts backup /data/backup-$(date +%F).db
```

**Data from the old version:** export the old MongoDB collections, then import them into a new, empty
database. Preparation times are kept, and clean-up is set to 30 minutes.

```sh
# On the old deployment
for c in rooms events logos; do docker exec mongo mongoexport --db conferences --collection $c --out /tmp/$c.json; done
docker cp mongo:/tmp/rooms.json . && docker cp mongo:/tmp/events.json . && docker cp mongo:/tmp/logos.json .
# On the new one
docker compose exec app mkdir -p /tmp/export
for c in rooms events logos; do docker compose cp $c.json app:/tmp/export/; done
docker compose exec app node src/server/cli.ts import-mongo /tmp/export
```

Raspberry Pi kiosk
------------------

Open the sign in Chromium in kiosk mode, for example from the desktop's autostart:

```sh
chromium --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble \
  --unsafely-treat-insecure-origin-as-secure=http://SERVER:8080 --user-data-dir=$HOME/.sign-profile \
  http://SERVER:8080/
```

- Browsers only allow the offline cache (service worker) and keeping the screen awake on HTTPS or
  `localhost`. Without HTTPS, the `--unsafely-treat-insecure-origin-as-secure` flag (which needs
  `--user-data-dir`) allows them for the sign's address.
- Turn off screen blanking (`raspi-config` → Display Options → Screen Blanking).
- Set the Pi's time zone to the venue's (`raspi-config` → Localisation Options). The sign corrects the
  clock itself, but days are counted in the Pi's time zone.
- A smart-TV browser without service workers also works. It keeps showing the last data while the
  network is down, but can't start up again without the server.

License
-------

- [src/web/assets](./src/web/assets): refer to [src/web/assets/LICENSE](./src/web/assets/LICENSE)
- [src/server/generic-logos](./src/server/generic-logos): emblems made from [Lucide](https://lucide.dev)
  icons, ISC license (some icons MIT): see [src/server/generic-logos/LICENSE](./src/server/generic-logos/LICENSE).
  Regenerate them with `node scripts/generate-generic-logos.mjs`.
- Everything else: refer to [LICENSE](./LICENSE)
