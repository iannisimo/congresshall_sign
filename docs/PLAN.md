# Rework plan

Progress tracker for the rewrite. Requirement IDs refer to the README; design is in
[ARCHITECTURE.md](ARCHITECTURE.md). `[x]` done · `[~]` partly done · `[ ]` to do.

## Phase 0: Planning
- [x] Read and summarize the old code
- [x] Requirements in README
- [x] Architecture and decisions in docs/ARCHITECTURE.md

## Phase 1: Scaffold
- [x] Single npm package at the root, `type: module`, Node ≥ 22.18
- [x] TypeScript configs for server+shared and web+shared
- [x] Vite + React + Tailwind 4, dev proxy to the server
- [x] vitest
- [x] Scripts: `dev`, `build`, `start`, `test`, `typecheck`, `passwd`, `cli`

## Phase 2: Shared core
- [x] Types and zod schemas (rooms, events, overrides, display snapshot, API inputs)
- [x] Status engine `computeRoomStatuses` (ROOM-1 … ROOM-4)
- [x] Conflict finder (ADMIN-7)
- [x] Tests for both (OPS-5)

## Phase 3: Server
- [x] Config from environment, checked with zod (OPS-4)
- [x] SQLite connection and migrations (OPS-2)
- [x] Users, scrypt hashing, sessions with sliding expiry, CLI `passwd` (AUTH-1 … AUTH-3)
- [x] `GET /api/display` with ETag/304 (SYNC-1)
- [x] Events CRUD with conflicts and multi-event create (ADMIN-6 … ADMIN-9)
- [x] Organizers and logos, image checks and resizing with sharp, logo by URL (ADMIN-10, ADMIN-11)
- [x] Rooms CRUD and order for the superadmin (ROOM-5), overrides (ROOM-4)
- [x] Serve the built web app with the right cache headers (OPS-1)
- [x] API tests

## Phase 4: Sign
- [x] Layout for 16:9: header (venue, logo, date, 12-hour clock), today, coming up, room strip (SIGN-1 … SIGN-4)
- [x] Event cards with logos, live progress, next-change hints
- [x] Pagination when today's events don't fit
- [x] Poller with ETag, snapshot in localStorage, server clock offset (SYNC-1, SIGN-7)
- [x] "Last update" note and the 3-day warning (SYNC-4)
- [x] Kiosk behaviour: no cursor, wake lock, error recovery, nightly reload (SIGN-5)

## Phase 5: Offline and self-update
- [x] Service worker: precached app, logo cache, SPA fallback (SYNC-2)
- [x] Reload on new version, with a loop guard (SIGN-6)

## Phase 6: Admin
- [x] Login, session handling, layout and navigation (ADMIN-1)
- [x] Day view: date navigation, timeline per room, event list, current statuses (ADMIN-2)
- [x] Overrides from the day view (ROOM-4)
- [x] Event editor: defaults, preview, `o`/`d` shortcuts, validation, conflict warning, several days, clone (ADMIN-3 … ADMIN-9)
- [x] Organizers and logo library (ADMIN-10, ADMIN-11)
- [x] Rooms page for the superadmin (ROOM-5)

## Phase 7: Operations
- [~] Dockerfile (multi-stage) and compose.yaml with a data volume (OPS-1, OPS-3): written; the image
      could not be built here (no Docker access). The runtime stage was reproduced by hand: production
      dependencies only, server serving the built app.
- [~] Update flake.nix: now `nodejs_24`; `flake.lock` points to a nixpkgs path missing on this machine,
      so `nix flake update` may be needed.
- [x] Import from the old MongoDB (`mongoexport` files), plus a `backup` command
- [x] README: development, deployment, Raspberry Pi kiosk setup

## Phase 8: Cleanup
- [x] Remove the old `backend/`, `frontend/`, `nginx.conf`, `dev-compose.yaml`, `dev_run` (logo asset and its license moved to `src/web/assets`)
- [x] Final check: typecheck, tests (55), build, app run and inspected in headless Chromium

## How it was checked
- Unit and API tests: status engine, conflicts, schemas, sign layout logic, auth (lockout, sliding
  sessions, logout on password change, cross-site requests), rooms, events, logos, snapshot ETag/304,
  overrides, Mongo import.
- In headless Chromium, with demo data: the sign at 1920×1080, 1366×768 and 1280×800; every admin page
  at desktop and phone width; the editor end to end (create an organizer inline, create a two-day event,
  overlap warning and confirmation).
- Offline: with the server stopped, the sign reloads from the service worker with logos and data, and the
  3-day warning appears when the last contact is old enough.
- Self-update: a tab running build A switched to build B by itself after the server was redeployed.

## Open points for review
1. Decisions taken without asking are listed at the end of ARCHITECTURE.md: sub-rooms can't be booked,
   hidden events are drafts, the admin area is in Italian, logos become 512 px PNGs, and so on.
2. Sign wording ("Free", "Occupied", "Reserved", "Now", "Coming up"): worth a check with real guests.
   It is all in `src/web/sign/strings.ts`.
3. Build and run the Docker image, and try the kiosk instructions on the Raspberry Pi.
4. Nothing is committed yet. The rewrite is in the working tree of `rework`.

## Possible next steps
- Announcement banner (TODO in the README).
- Linting: the old ESLint setup is gone. TypeScript 7 has no JavaScript API yet, so typescript-eslint may
  not work; oxlint could.
- Browser tests (e.g. Playwright) for the editor flows checked by hand above.

## Changes after the first review
- [x] Live cards: no blue bar on the left (the progress bar at the bottom stays)
- [x] Long titles, subtitles and "organizer · rooms" lines scroll; speed and pause set by the superadmin on
      the new "Impostazioni" page (SIGN-8); pages of cards wait for their texts to scroll through
- [x] Bigger logo in the sign's header

## Changes after the second review
- [x] Default preparation and clean-up: from the changeover time (superadmin setting, default 14:00) of the
      day before to the next changeover after the end;
      "none" as the other highlighted option; custom times on request. Multi-day congresses keep the
      room reserved between days.
- [x] Conflicts only when events run at the same time; margins may overlap
- [x] Timeline: events as blocks, preparation and clean-up as stripes (also from neighbouring days);
      the day's list shows only events running that day
- [x] The old-data import uses the same clean-up rule

## Changes after the third review
- [x] Programme page shows a week (Monday to Sunday): timeline and event list for each day, one under the other

## Log
- 2026-10-17: requirements agreed, plan written; shared core, server, sign, admin, offline support,
  container setup, import and docs done; old code removed.
- 2026-10-17: first review: scrolling long texts with superadmin settings, bigger logo, no live bar.
- 2026-10-18: logout fix; commits; changeover margins for congresses, changeover time as a setting.
