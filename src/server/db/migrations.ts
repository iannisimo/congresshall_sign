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
];
