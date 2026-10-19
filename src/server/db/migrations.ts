// Applied in order; the index of the last applied one is kept in PRAGMA user_version.
// Never edit a migration that has shipped: add a new one.
export const migrations: string[] = [
  `
  CREATE TABLE rooms (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('main', 'sub')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    blocked_message TEXT
  );

  CREATE TABLE room_parents (
    room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    parent_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    PRIMARY KEY (room_id, parent_id)
  );

  CREATE TABLE organizers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
  );

  CREATE TABLE logos (
    id INTEGER PRIMARY KEY,
    organizer_id INTEGER NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    mime TEXT NOT NULL,
    data BLOB NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX logos_organizer ON logos(organizer_id);

  CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    organizer_id INTEGER NOT NULL REFERENCES organizers(id),
    logo_id INTEGER REFERENCES logos(id),
    title TEXT NOT NULL,
    subtitle TEXT,
    prep_at INTEGER NOT NULL,
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL,
    release_at INTEGER NOT NULL,
    visible INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK (prep_at <= start_at AND start_at < end_at AND end_at <= release_at)
  );
  CREATE INDEX events_time ON events(release_at, prep_at);

  CREATE TABLE event_rooms (
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (event_id, room_id)
  );
  CREATE INDEX event_rooms_room ON event_rooms(room_id);

  CREATE TABLE overrides (
    room_id INTEGER PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('free', 'occupied', 'reserved')),
    message TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    until_next_change INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE users (
    username TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('admin', 'superadmin')),
    password_hash TEXT,
    password_changed_at INTEGER
  );
  INSERT INTO users (username, role) VALUES ('admin', 'admin'), ('superadmin', 'superadmin');

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(username);
  `,
  `
  -- JSON values by key; missing keys use the defaults in src/shared/settings.ts.
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE event_breaks (
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL
  );
  CREATE INDEX event_breaks_event ON event_breaks(event_id);
  `,
  `
  -- Carousel images and videos; the files live in DATA_DIR/media.
  CREATE TABLE media (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    file TEXT NOT NULL,
    size INTEGER NOT NULL,
    sort_order INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  `,
  `
  ALTER TABLE media ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE media ADD COLUMN fit TEXT CHECK (fit IN ('contain', 'fill', 'cover'));
  `,
  `
  -- Logos and media are cached by browsers forever under their id, so a deleted id must never come back
  -- (SQLite would reuse the highest one). Inserts take the next id from here; the triggers keep it ahead.
  CREATE TABLE id_sequences (name TEXT PRIMARY KEY, next INTEGER NOT NULL);
  INSERT INTO id_sequences SELECT 'logos', coalesce(max(id), 0) + 1 FROM logos;
  INSERT INTO id_sequences SELECT 'media', coalesce(max(id), 0) + 1 FROM media;
  CREATE TRIGGER logos_sequence AFTER INSERT ON logos BEGIN
    UPDATE id_sequences SET next = max(next, NEW.id + 1) WHERE name = 'logos';
  END;
  CREATE TRIGGER media_sequence AFTER INSERT ON media BEGIN
    UPDATE id_sequences SET next = max(next, NEW.id + 1) WHERE name = 'media';
  END;
  `,
  `
  -- Internal notes for the venue staff, never sent to the sign.
  ALTER TABLE events ADD COLUMN reception_notes TEXT;
  ALTER TABLE events ADD COLUMN housekeeping_notes TEXT;
  `,
  `
  -- The media account, which only manages the carousel. SQLite can't change a CHECK, so the table is
  -- rebuilt; dropping it would delete the sessions, which are put back so nobody is logged out.
  CREATE TABLE users_new (
    username TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('admin', 'superadmin', 'media')),
    password_hash TEXT,
    password_changed_at INTEGER
  );
  INSERT INTO users_new SELECT username, role, password_hash, password_changed_at FROM users;
  INSERT INTO users_new (username, role) VALUES ('media', 'media');
  CREATE TEMP TABLE sessions_kept AS SELECT * FROM sessions;
  DROP TABLE users;
  ALTER TABLE users_new RENAME TO users;
  INSERT INTO sessions SELECT * FROM sessions_kept;
  DROP TABLE sessions_kept;
  `,
  `
  -- Carousel presets: named, ordered selections of the media library, picked by the sign with ?preset=.
  -- On/off, fit and order move from the media row to the preset's items.
  CREATE TABLE media_presets (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 40),
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    image_seconds INTEGER,
    fit TEXT CHECK (fit IN ('contain', 'fill', 'cover')),
    is_default INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX media_presets_default ON media_presets(is_default) WHERE is_default = 1;
  CREATE TABLE media_preset_items (
    preset_id INTEGER NOT NULL REFERENCES media_presets(id) ON DELETE CASCADE,
    media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    fit TEXT CHECK (fit IN ('contain', 'fill', 'cover')),
    PRIMARY KEY (preset_id, media_id)
  );
  CREATE INDEX media_preset_items_media ON media_preset_items(media_id);
  INSERT INTO media_presets (name, label, sort_order, is_default) VALUES ('default', 'Predefinito', 0, 1);
  INSERT INTO media_preset_items (preset_id, media_id, position, enabled, fit)
    SELECT (SELECT id FROM media_presets WHERE is_default = 1), id, sort_order, enabled, fit FROM media;
  ALTER TABLE media DROP COLUMN enabled;
  ALTER TABLE media DROP COLUMN fit;
  ALTER TABLE media DROP COLUMN sort_order;
  `,
  `
  -- Multi-day events: an event has days, a day has bookings (room occupations). The app had not been used
  -- in production, so existing events are dropped, not converted. Children first: with foreign keys on,
  -- dropping a parent runs an implicit DELETE.
  DROP TABLE event_breaks;
  DROP TABLE event_rooms;
  DROP TABLE events;

  CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    organizer_id INTEGER NOT NULL REFERENCES organizers(id),
    logo_id INTEGER REFERENCES logos(id),
    title TEXT NOT NULL,
    subtitle TEXT,
    visible INTEGER NOT NULL DEFAULT 1,
    reception_notes TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX events_dates ON events(start_date, end_date);

  CREATE TABLE event_days (
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    reception_notes TEXT,
    housekeeping_notes TEXT,
    UNIQUE (event_id, date)
  );

  CREATE TABLE event_bookings (
    id INTEGER PRIMARY KEY,
    day_id INTEGER NOT NULL REFERENCES event_days(id) ON DELETE CASCADE,
    label TEXT,
    prep_at INTEGER NOT NULL,
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL,
    release_at INTEGER NOT NULL,
    CHECK (prep_at <= start_at AND start_at < end_at AND end_at <= release_at)
  );
  CREATE INDEX event_bookings_day ON event_bookings(day_id);
  CREATE INDEX event_bookings_time ON event_bookings(release_at, prep_at);

  CREATE TABLE event_booking_rooms (
    booking_id INTEGER NOT NULL REFERENCES event_bookings(id) ON DELETE CASCADE,
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (booking_id, room_id)
  );
  CREATE INDEX event_booking_rooms_room ON event_booking_rooms(room_id);

  CREATE TABLE event_booking_breaks (
    booking_id INTEGER NOT NULL REFERENCES event_bookings(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL
  );
  CREATE INDEX event_booking_breaks_booking ON event_booking_breaks(booking_id);
  `,
];
