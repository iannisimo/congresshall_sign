# Multi-day events: implementation plan

Hand this file to the agent(s) doing the work. Each numbered task is sized for one agent. Read
`docs/ARCHITECTURE.md` and the README requirements first; the rules there (erasable TypeScript on the server,
`.ts` import extensions, Italian admin wording, English-ish sign wording, shared zod schemas) still apply.

## Why

Today a congress of three days is stored as three unrelated events (the editor's "Aggiungi un giorno" just
creates copies, ADMIN-8). The app is becoming a planner first and a sign second, so an event must be **one
thing with a start and an end date**, and each of its days must say **which rooms it uses, when** (possibly
several room occupations per day, e.g. plenary in Sala A in the morning, workshops in B and C in the
afternoon), with **notes for the staff per day**.

## Target data model

Vocabulary used everywhere below (code names in brackets):

- **Event** (`ScheduledEvent`): organizer, logo, title, subtitle, visible (draft or not), event-level
  reception notes, and its **days**.
- **Day** (`EventDay`): one calendar date of the event (`'YYYY-MM-DD'`, local time of the server's `TZ`). Days
  are consecutive, from `startDate` to `endDate`, one entry per date, no gaps. A day may have **no bookings**
  (e.g. an excursion day): it still belongs to the event and has notes.
- **Booking** (`EventBooking`): one room occupation on a day: rooms, `prepAt ≤ startAt < endAt ≤ releaseAt`,
  breaks, optional internal label ("Plenaria", "Workshop"). Exactly what an event is today, minus the
  organizer/title/notes.

### Notes

| Note | Where | Italian label |
| --- | --- | --- |
| Reception, whole event | `event.receptionNotes` | "Reception (tutto l’evento)" |
| Reception, per day | `day.receptionNotes` | "Reception (questo giorno)" |
| Housekeeping and room preparation, per day | `day.housekeepingNotes` | "Housekeeping e preparazione sala" |

There is **no** event-level housekeeping note: housekeeping (which also covers how the room is prepared)
is per day only.

**"Same as previous"**: on every day after the first, the two per-day note fields show the placeholder
*"Come il giorno precedente"*. A `null` per-day note on day N > 1 **means** "same as day N−1" (resolved
recursively). Day 1 `null` means no note. To say "nothing today" after a day with notes, the user writes `—`
(document this in the field hint). The resolution lives in one shared helper (see task 1) used by the editor
hint, the prints and the programme.

### Shared types (`src/shared/model.ts`)

```ts
export interface EventBooking {
  /** Changes every time the event is saved: don't keep it anywhere. */
  id: number;
  label: string | null;
  roomIds: number[];          // display order
  prepAt: number;
  startAt: number;            // on the day's date (local)
  endAt: number;              // may be past midnight
  releaseAt: number;
  breaks: EventBreak[];
}

export interface EventDay {
  date: string;               // 'YYYY-MM-DD'
  receptionNotes: string | null;
  housekeepingNotes: string | null;
  bookings: EventBooking[];   // by startAt
}

export interface ScheduledEvent {
  id: number;
  organizerId: number;
  organizerName: string;
  logoId: number | null;
  title: string;
  subtitle: string | null;
  visible: boolean;
  startDate: string;          // = days[0].date
  endDate: string;            // = days.at(-1).date
  receptionNotes: string | null;
  days: EventDay[];
}

/**
 * One booking with its event's public fields: what the sign gets, and what the timeline, the status
 * engine and the conflict check work on. Shape of today's SignEvent plus eventId and date.
 */
export interface SignEvent {
  id: number;                 // booking id
  eventId: number;
  date: string;               // the booking's day
  organizerId: number;
  organizerName: string;
  logoId: number | null;
  title: string;
  subtitle: string | null;
  roomIds: number[];
  prepAt: number; startAt: number; endAt: number; releaseAt: number;
  breaks: EventBreak[];
  visible: boolean;
}
```

`INTERNAL_EVENT_FIELDS` goes away: the sign gets `SignEvent`s built by flattening, which simply don't carry
notes or labels. `Conflict` becomes `{ booking: SignEvent; roomIds: number[] }`.

### API input (`src/shared/schemas.ts`)

```ts
bookingInput = { label: optionalText(80), roomIds, prepAt, startAt, endAt, releaseAt, breaks }   // today's time + break rules
dayInput     = { date: /^\d{4}-\d{2}-\d{2}$/, receptionNotes, housekeepingNotes: optionalText(4000),
                 bookings: array(bookingInput).max(20) }
eventInput   = { organizerId, logoId, title, subtitle, visible, receptionNotes: optionalText(4000),
                 days: array(dayInput).min(1).max(60) }
```

Extra refinements on `eventInput` (Italian messages, with a `path` that points at the day/booking so the
editor can mark the right tab):

- days are consecutive dates, no repeats, no gaps;
- at least one booking in the whole event ("Aggiungi almeno un’occupazione delle sale");
- each booking's `startAt` falls on its day's date (local);
- two bookings of the **same** event never use the same room at overlapping `[startAt, endAt)`.

### SQLite

```
events                 id, organizer_id, logo_id, title, subtitle, visible, reception_notes,
                       start_date TEXT, end_date TEXT, created_at, updated_at
event_days             id, event_id → events ON DELETE CASCADE, date TEXT, reception_notes, housekeeping_notes, UNIQUE(event_id, date)
event_bookings         id, day_id → event_days ON DELETE CASCADE, label, prep_at, start_at, end_at, release_at,
                       CHECK(prep_at <= start_at AND start_at < end_at AND end_at <= release_at)
                       INDEX (release_at, prep_at)
event_booking_rooms    booking_id → event_bookings ON DELETE CASCADE, room_id → rooms, position, PK(booking_id, room_id)
                       INDEX (room_id)
event_booking_breaks   booking_id → event_bookings ON DELETE CASCADE, label, start_at, end_at
```

Saving an event replaces all its days and bookings (delete + insert in one transaction). The event id is
stable (ADMIN-9); booking ids are not, and nothing may rely on them across saves.

### API changes

| Method & path | Change |
| --- | --- |
| `GET /events?from=&to=` | `to` becomes optional (no upper bound). Returns whole `ScheduledEvent`s for which **any booking holds a room** in `[from, to)` (`release_at > from AND prep_at < to`) **or any day's date** falls in that range. Ordered by `start_date`, then first `startAt`, then id. |
| `GET /events/:id` | Whole event. |
| `POST /events` | Body `{ event: EventInput, allowConflicts? }`: **one** event (multi-create is gone: a multi-day event is one event). Returns `{ id }`. |
| `PUT /events/:id` | Body unchanged in shape (`{ event, allowConflicts? }`), new `EventInput`. |
| `DELETE /events/:id` | Deletes the event with all its days. |
| `GET /display` | `events` = flattened `SignEvent[]` of visible events, bookings overlapping the display window. |

409 body: `{ error, conflicts: { date: string; bookingIndex: number; conflicts: Conflict[] }[] }`.
Conflicts compare each booking with other **events'** bookings (same rule as today: overlapping
`[startAt, endAt)`, shared room, drafts count). Bookings of the same event are covered by the schema.

### Admin URLs

- Editor: `/admin/events/:id?day=YYYY-MM-DD&d=YYYY-MM-DD`. `day` selects the day tab (default: today's tab
  if the event runs today, otherwise the first day); `d` is where "back" returns, as now.
- New event: `/admin/events/new?d=…&room=…&start=…` as now (start date = `d`, one day, one booking).
- Clone: `/admin/events/:id/clone`: all days and bookings copied; changing the start date shifts them.
- Events list (new tab): `/admin/events` (index route next to `events/new` and `events/:id`).

## Tasks

Dependencies: **1 → 2 → (3, 4, 5, 6, 7 in parallel) → (8, 9 in parallel) → 10.** Tasks 1 and 2 can be done
by the same agent. **Task 11 (media presets) is independent** of the events work and can run at any time,
in parallel with the others (see its notes on shared files). Each task lists the files it owns; don't edit files owned by a task running in parallel
except where noted (and then keep the change minimal).

---

### Task 1: Shared model, schemas and helpers

**Owns:** `src/shared/model.ts`, `src/shared/schemas.ts`, `src/shared/conflicts.ts`, `src/shared/time.ts`,
new `src/shared/events.ts`, their tests.

1. Types and schemas exactly as above. Keep `EventBreak`, `BREAK_PRESETS`, all non-event types unchanged.
2. Move `toDateValue` / `fromDateValue` (local `'YYYY-MM-DD'` ↔ ms) from `src/web/admin/dates.ts` into
   `src/shared/time.ts` so the schema can check "booking starts on its day"; re-export from
   `dates.ts` so web callers don't change.
3. `src/shared/events.ts`:
   - `flattenEvent(event: ScheduledEvent): SignEvent[]` and `flattenEvents(events)`.
   - `eventToInput(event: ScheduledEvent): EventInput` (used to flip visibility from lists).
   - `effectiveDayNotes(event | input, dayIndex): { receptionNotes, housekeepingNotes, inherited: {…: boolean} }`
     implementing "null on day N>1 = same as previous".
   - `eventDates(startDate, endDate): string[]` and `shiftEvent(input, days: number)` (moves every day and every
     booking/break time by whole days, keeping local clock times across DST).
   - `dayHours(day): { startAt, endAt } | null` (earliest start, latest end of the day's bookings).
4. `findConflicts(candidate: { eventId?, roomIds, startAt, endAt }, others: SignEvent[])`: skip bookings with
   `others[i].eventId === candidate.eventId`.
5. `status.ts` and the sign keep working on `SignEvent[]`: only fix compile errors.
6. Tests: schema refinements (gaps, repeated dates, booking off its day, internal room overlap, no booking at
   all), `effectiveDayNotes` chains, `shiftEvent` across a DST change, conflicts ignoring the own event.

### Task 2: Database, repository, routes, import

**Owns:** `src/server/**` (except the `cli.ts` command of task 3), `src/server/app.test.ts`.

1. **Migration 9** (SQL): the app has not been used in production, so **existing events are not converted**.
   Drop `event_breaks`, `event_rooms`, then `events` (children first: with `foreign_keys` ON, dropping a parent
   runs an implicit cascading `DELETE`), and create the new `events`, `event_days`, `event_bookings`,
   `event_booking_rooms`, `event_booking_breaks` tables with their indexes. Organizers, logos and rooms stay.
   Test that a database at `user_version` 8 with events migrates cleanly (events gone, organizers kept).
2. Nothing else in the schema references `events`; check `organizers.ts` (event counts, logo use) still works.
3. `data/events.ts`: rewrite `listEvents`, `getEvent`, `insertEvent`, `updateEvent`, `deleteEvent` for the
   nested shape (one query per table and assemble in TS is fine; keep it readable). `listEvents({from, to?,
   visibleOnly?})` with the semantics in the API table.
4. `routes/events.ts`: new bodies; `checkReferences` walks all bookings (main rooms only, logo belongs to
   organizer); conflicts per booking via `flattenEvent` + `findConflicts`, 409 body as specified.
5. `routes/display.ts`: `flattenEvents(listEvents(..., visibleOnly))`, keep only bookings overlapping the
   window; the ETag logic is unchanged.
6. `data/rooms.ts` (room deletion refused while upcoming events use it) and anything else reading
   `event_rooms` / `events.start_at`: switch to `event_booking_rooms` / `event_bookings`.
7. `import-mongo.ts`: build one-day events through the new `insertEvent`.
8. Update `app.test.ts`: the events suite (create/edit/delete, notes off the sign, breaks, validation,
   conflicts, congress days not conflicting) for the new shape; drop "creates the same event on several days
   at once" and add "a three-day event with two bookings on day 2" and "display flattens bookings".
9. `npm test` and `npm run typecheck` (server config) green. The web app will not typecheck until tasks
   4–7 land; that's expected.

### Task 3: CLI command to delete every event

**Owns:** `src/server/cli.ts` (new command) + a test.

Add `node src/server/cli.ts delete-events [--yes]`: deletes every event (with their days, bookings, rooms
and breaks) in one transaction; organizers, logos, rooms, media and settings stay. Without `--yes` it only
prints how many events would be deleted and asks to repeat with `--yes`. The help text advises running
`backup` first. Task 10 documents it in the README's command list.

### Task 4: Event editor with day tabs

**Owns:** `src/web/admin/EventEditor.tsx` (split into `EventEditor.tsx`, `DayTab.tsx`, `BookingFields.tsx`
if it grows past ~600 lines), `src/web/admin/dates.ts`.

Layout (Italian):

1. **Organizzatore** (unchanged), **Evento**: title, subtitle, visible toggle stays in the sidebar.
2. **Date**: "Dal" / "Al" date inputs (with `o`/`d` shortcuts). Changing *Dal* shifts the whole event
   (`shiftEvent`), keeping its length. Changing *Al* adds days at the end (each new day copies the previous
   day's bookings, times moved by one day, notes empty = "same as previous") or removes days from the end
   (confirm if the removed days have bookings or notes). Each day tab also has "Togli questo giorno" on the
   first and last day only (days must stay consecutive).
3. **Reception (tutto l’evento)** textarea.
4. **Giorni**: a tab strip, one tab per day ("lun 20 ott"), showing the number of bookings, an amber dot when
   that day has validation errors or conflicts. The selected tab is in the URL (`?day=`, `replace: true`), so
   coming from the programme opens the right one.
5. **Day tab content:**
   - List of **occupazioni sale** (bookings). Each one is a card with: optional label, room chips (as now),
     start–end, breaks editor (as now), preparation/clean-up mode (as now, per booking), a remove button.
     "+ Aggiungi occupazione" adds one (default: after the last one, same rooms unchecked).
   - "Copia dal giorno precedente" (replace this day's bookings with the previous day's, same clock times) and
     "Applica ai giorni seguenti" (copy this day's bookings to every later day, after a confirm).
   - Notes: *Housekeeping e preparazione sala*, *Reception (questo giorno)*. On days after the first the
     placeholder is "Come il giorno precedente" and the hint shows the inherited text (first line, trimmed)
     from `effectiveDayNotes`.
6. **Sidebar:** sign preview of the selected day's first booking (or nothing if none), visibility, the
   conflict list for **all** days (each line says the day, clicking it selects that tab), Save/Cancel/Delete.
   "Elimina evento" confirms with the number of days ("Eliminare «X» e tutti i suoi 3 giorni?").

Draft state: keep the existing "times of day + margin mode" style per booking (`DraftBooking`), build the
`EventInput` with the same past-midnight rules as today's `buildInputs`. Map zod issue paths
(`days.2.bookings.0.roomIds`) to the tab and booking for error display. After saving, go back to
`/admin?d=<backTo>`.

### Task 5: Programme, calendar, timeline and day print on the new shape

**Owns:** `WeekView.tsx`, `Timeline.tsx`, `MonthView.tsx`, `DayPrint.tsx`, `RoomStatusPanel.tsx`,
`SignPreview.tsx` (compile fixes only).

1. `useEvents` now returns `ScheduledEvent[]`; work on `flattenEvents(...)` for the timeline and the calendar
   dots. `Timeline` takes `SignEvent[]`; `onOpen(booking)` navigates to
   `/admin/events/${booking.eventId}?day=${booking.date}&d=${value}`.
2. `DaySection` list: **one row per event that has that date among its days** (not per booking). The row shows
   organizer, title, "giorno 2 di 3" for multi-day events, then one line per booking of that day
   (label · start–end · held time · rooms). Edit and the title link open the editor on that day's tab.
   Visibility toggle uses `eventToInput`. Delete confirms with the number of days. Drafts styled as now.
3. `MonthView`: dots per room from the flattened bookings (same visible/draft rule). Optionally a thin bar
   under days belonging to the same multi-day event is **not** required.
4. `DayPrint`: per event of the day: organizer, title, that day's bookings (times, rooms, breaks), event
   reception notes, the day's reception and housekeeping notes resolved with `effectiveDayNotes`
   (print the inherited text, with "(come il giorno precedente)" in small type).
5. `api.ts` hooks: `useEvents(from, to?)`. Move the print helper `printSheet` untouched; tasks 8 and 9
   reuse it.

### Task 6: Sign on bookings

**Owns:** `src/web/sign/**`.

The sign already works on `SignEvent[]`; with bookings it may get several items with the same `eventId` on
a day. Changes:

1. `schedule.ts` `buildSignView`: in **coming up**, merge the bookings of the same event on the same day into
   one line (earliest start, rooms in display order, deduplicated). Featured cards stay one per booking
   (different times and rooms are real information). Add tests to `schedule.test.ts`.
2. React keys stay `id` (booking id); check nothing else assumes one item per event (e.g. hero mode counting
   "one or two events": count distinct `eventId`s? Decide by testing a day with a morning and an afternoon
   booking of one congress: two hero cards with the same title is acceptable; document what you chose in
   ARCHITECTURE).
3. `status.test.ts` should still pass unchanged; add one case with two bookings of one event in different rooms.

### Task 7: Events list tab

**Owns:** new `src/web/admin/EventList.tsx`, `AdminApp.tsx` (route and nav item).

1. Nav item **"Eventi"** (lucide `List`), between *Calendario* and *Organizzatori*; route `/admin/events`
   (react-router ranks `events/new` and `events/:id` separately, so they don't clash).
2. Data: `useEvents(startOfToday)` without upper bound → every event whose `endDate ≥ today`, live ones
   included, ordered by start.
3. Each row: logo, organizer, title, subtitle, dates ("20–22 ott 2026 · 3 giorni", or a single date), rooms
   used across all days (display order, deduplicated), badges *In corso* (today within its dates) and
   *Bozza*. Actions: modifica (opens today's tab if live, else the first), duplica, stampa dettagli (task 9
   hooks in here), elimina.
4. Above the list: a text filter (organizer or title, case-insensitive), a "Nascondi bozze" toggle, and the
   two print buttons from tasks 8 and 9 (leave placeholders `onPrintRestaurant` / `onPrintDetails` if those
   tasks are not done yet). Group rows under month headings ("ottobre 2026").
5. Empty state: "Nessun evento in programma".

### Task 8: Restaurant print, next 14 days

**Owns:** new `src/web/admin/RestaurantPrint.tsx`; wiring in `EventList.tsx` (button only).

Button **"Stampa ristorante (14 gg)"** on the events list. Uses `printSheet` and the `.print-sheet` styles.

- Window: `[start of today, start of today + 14 days)`, independent of the list filters.
- Grouped **by event**, ordered by first day in the window. For each event: organizer (bold, large), title
  (small), then a compact table with one row per day **in the window that has bookings**: date ("lun 20 ott"),
  hours (`dayHours`: "09:00–18:00"; if the day's bookings don't overlap or touch, list each range:
  "09:00–13:00, 15:00–18:00"), breaks (deduplicated by label + time across the day's bookings:
  "Coffee break 10:30–11:00 · Lunch break 13:00–14:00", or "—").
- Drafts are included and clearly marked "DA CONFERMARE" (bold, framed; see decision 4).
- Header: "Ristorante · dal 19 ott al 1 nov 2026", printed-at time in small type in the footer.
- No rooms, no internal notes.
- Unit-test the pure part (building rows from events) in `RestaurantPrint.test.ts` or a helper file.

### Task 9: Detailed print

**Owns:** new `src/web/admin/EventsPrint.tsx`; wiring in `EventList.tsx` (button + row action) and a
"Stampa" button in the editor's sidebar (one line in `EventEditor.tsx`, coordinate with task 4).

Prints **the events currently shown in the list** (after its filters), or one event from its row/editor.

For each event (page break between events, `break-before: page`):

- Organizer, title, subtitle, dates and number of days, *Bozza* if hidden.
- Reception (tutto l’evento).
- For each day: date heading; table of bookings (label, rooms, preparation from, start–end, free again at,
  breaks); then the two day notes resolved with `effectiveDayNotes`, inherited ones printed in full with
  "(come il giorno precedente)"; days without bookings say "Nessuna sala".

### Task 10: Documentation

**Owns:** `README.md`, `docs/ARCHITECTURE.md`, `docs/PLAN.md`. After tasks 1–9.

- README: rewrite ADMIN-8 (multi-day events with days and room occupations), ADMIN-13 (note levels and
  "same as previous"), ADMIN-2 (programme rows per event and day), add ADMIN-14 (events list) and ADMIN-15
  (restaurant and detailed prints); CLI `delete-events`.
- ARCHITECTURE: data model section, API table, conflicts paragraph, sync section (flattened bookings),
  migration functions, decisions taken (the list below).
- PLAN.md: a new phase with these tasks ticked.
- Media presets (task 11): extend SIGN-11 in the README (presets, `?preset=`), the `media_presets` tables
  and the preset routes in ARCHITECTURE.
- Delete this file once everything is merged.

### Task 11: Media presets (`?preset=<name>`)

**Owns:** `src/server/data/media.ts`, `src/server/routes/media.ts`, `src/web/admin/Media.tsx`,
`src/web/sign/useSnapshot.ts`, `src/web/sign/Carousel.tsx`, media tests in `app.test.ts` (the `media` and
`media account` suites only).
**Shared with tasks 1/2/6, keep changes small:** `src/shared/model.ts` and `schemas.ts` (add types and
schemas, don't touch event ones), `src/server/routes/display.ts` (only the `media` line and the query
parameter), `src/server/db/migrations.ts` (append; whichever of task 2 and task 11 merges second takes the
next migration number), `src/web/sign/Sign.tsx` (only reading the preset).

**Goal:** different screens (or the same screen at different times, by changing its URL) show different
carousels. A **preset** is a named, ordered selection of items from the one media library. The sign picks
its preset with `?preset=<name>` in its URL (`/?preset=bar`, `/big?preset=bar`, `/carousel?preset=bar`);
without the parameter, or with an unknown name, it uses the **default** preset.

Model:

- The media **library** stays as it is (uploads, files, names, kind). `enabled`, `fit` and the order move
  from the item to the preset, so the same video can be on in one preset and off in another.
- `media_presets`: `id`, `name` (URL slug, `^[a-z0-9-]{1,40}$`, unique), `label` (shown in the admin area),
  `sort_order`, `image_seconds` (nullable: null = the global `carouselImageSeconds`), `fit` (nullable: null =
  the global `carouselFit`), `is_default` (exactly one row).
- `media_preset_items`: `preset_id → media_presets ON DELETE CASCADE`, `media_id → media ON DELETE CASCADE`,
  `position`, `enabled`, `fit` (nullable: null = the preset's fit). PK `(preset_id, media_id)`.
- Migration: create the tables, insert the default preset (`name = 'default'`, label "Predefinito",
  overrides null), copy every media row into it with its current `sort_order`, `enabled` and `fit`, then
  drop `media.enabled`, `media.fit` (and `sort_order` if nothing else needs it; the library can be listed by
  upload date).
- Shared types: `MediaPreset { id, name, label, isDefault, imageSeconds: number | null, fit: MediaFit | null,
  items: { mediaId, enabled, fit }[] }`. `MediaItem` loses `enabled` and `fit`.

API (🖼️ = media or superadmin):

| Method & path | | Purpose |
| --- | --- | --- |
| `GET /media` | 🖼️ | The library, newest first (unchanged otherwise) |
| `POST /media` | 🖼️ | Upload as now; optional `X-Preset-Id` header adds the new item, enabled, at the end of that preset (the admin page sends the preset being edited). Without it, the item is added to the default preset. |
| `DELETE /media/:id` | 🖼️ | Deletes the file; it disappears from every preset |
| `GET /media-presets` | 🖼️ | All presets with their items, default first, then `sort_order` |
| `POST /media-presets` | 🖼️ | `{name, label, copyFrom?}`: new preset, empty or a copy of another one's items |
| `PATCH /media-presets/:id` | 🖼️ | `{name?, label?, imageSeconds?, fit?}`; the default preset's `name` can't change |
| `PUT /media-presets/:id/items` | 🖼️ | `{items: {mediaId, enabled, fit}[]}`: the whole ordered list (add, remove, reorder, toggle in one call) |
| `PUT /media-presets/:id/default` | 🖼️ | Makes this preset the default |
| `DELETE /media-presets/:id` | 🖼️ | Not the default one (409) |
| `GET /display?preset=<name>` | 🔓 | `media` = the enabled items of that preset (or of the default), plus `mediaPreset: { name, imageSeconds, fit }` with the overrides already resolved against the global settings |

The replaced endpoints (`PATCH /media/:id`, `PUT /media/order`) go away; `PUT /settings/carousel` stays for
the global defaults.

Sign:

- `useSnapshot` reads `preset` from `location.search` once and calls `/api/display?preset=…`. The
  localStorage keys get the preset as a suffix (`sign.snapshot:bar`), so a screen whose URL changes doesn't
  start from another preset's snapshot; no suffix for the default, so existing screens keep their stored
  snapshot.
- The ETag already depends on the body, so it differs by preset without changes.
- `Sign.tsx` / `Carousel` use `snapshot.mediaPreset.imageSeconds` and `.fit` instead of the settings.
  `usePrefetchMedia` prefetches only that preset's items (already true, since `snapshot.media` is filtered).
- The `/carousel` "no active media" message names the preset when it isn't the default.

Admin (*Media* page):

- A preset bar at the top: one chip per preset (the default marked "Predefinito"), "+ Nuovo preset"
  (name, label, start empty or copy of the current one). The selected preset is in the URL (`?preset=`).
- Below, the selected preset's settings (label, URL name, image seconds and fit with "come
  impostazione generale" as the empty choice, "Rendi predefinito", "Elimina preset") and a copyable sign URL
  (`/?preset=bar`, and `/carousel?preset=bar` as "Anteprima").
- The item grid shows the preset's items in its order (drag to reorder, switch, fit, as now, but per
  preset), then a "Libreria" section with the library items not in this preset, each with "Aggiungi".
  Deleting a file from the library warns when other presets use it ("Usato anche in: Bar, Ingresso").

Tests: migration from the current schema keeps order, enabled and fit in the default preset; `/display`
with no preset, the default, another preset and an unknown name; the default can't be deleted and there is
always exactly one; deleting media removes it from presets; the media account can manage presets and still
nothing else.

## Decisions (answered by the owner)

1. **Notes:** no separate "room set-up" note and no event-level housekeeping. Housekeeping (including room
   preparation) is per day; reception is per event and per day.
2. **Empty per-day note = same as previous day** (real inheritance, not just a placeholder). The prints
   show the inherited text.
3. **Breaks belong to a booking**, not to the day. The restaurant print merges them per day.
4. **Drafts in the restaurant print** are included and **clearly marked** "DA CONFERMARE" (bold, framed or
   highlighted so it can't be missed on paper). The day print keeps leaving them out.
5. **No legacy data:** the app hasn't been used in production. The migration drops existing events instead
   of converting them, and a CLI command deletes every event (task 3).
6. **Sign:** one featured card per booking; coming-up list merged per event and day.
7. **Media presets** really differ: each has its own order, on/off switches and fit per item, plus optional
   image duration and fit for the whole preset.
8. **Unknown `?preset=`** silently falls back to the default; the admin page shows each preset's exact URL.
