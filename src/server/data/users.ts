import type { Role, SessionUser } from '../../shared/model.ts';
import { get, run, transaction, type Db } from '../db/database.ts';

export const USERNAMES = ['admin', 'superadmin', 'media'] as const;

export interface UserRecord extends SessionUser {
  passwordHash: string | null;
}

export function getUser(db: Db, username: string): UserRecord | undefined {
  const row = get<{ username: string; role: Role; password_hash: string | null }>(
    db,
    'SELECT username, role, password_hash FROM users WHERE username = :username',
    { username },
  );
  return row && { username: row.username, role: row.role, passwordHash: row.password_hash };
}

/** Sets the password and logs the user out everywhere. */
export function setPassword(db: Db, username: string, passwordHash: string, now: number): void {
  transaction(db, () => {
    run(db, 'UPDATE users SET password_hash = :passwordHash, password_changed_at = :now WHERE username = :username', {
      username,
      passwordHash,
      now,
    });
    run(db, 'DELETE FROM sessions WHERE username = :username', { username });
  });
}

export function usersWithoutPassword(db: Db): string[] {
  return USERNAMES.filter((u) => !getUser(db, u)?.passwordHash);
}

export interface SessionRecord {
  user: SessionUser;
  expiresAt: number;
}

export function createSession(db: Db, tokenHash: string, username: string, now: number, expiresAt: number): void {
  run(
    db,
    'INSERT INTO sessions (token_hash, username, created_at, expires_at) VALUES (:tokenHash, :username, :now, :expiresAt)',
    { tokenHash, username, now, expiresAt },
  );
}

export function findSession(db: Db, tokenHash: string, now: number): SessionRecord | undefined {
  const row = get<{ username: string; role: Role; expires_at: number }>(
    db,
    `SELECT u.username, u.role, s.expires_at FROM sessions s JOIN users u ON u.username = s.username
     WHERE s.token_hash = :tokenHash AND s.expires_at > :now`,
    { tokenHash, now },
  );
  return row && { user: { username: row.username, role: row.role }, expiresAt: row.expires_at };
}

export function extendSession(db: Db, tokenHash: string, expiresAt: number): void {
  run(db, 'UPDATE sessions SET expires_at = :expiresAt WHERE token_hash = :tokenHash', { tokenHash, expiresAt });
}

export function deleteSession(db: Db, tokenHash: string): void {
  run(db, 'DELETE FROM sessions WHERE token_hash = :tokenHash', { tokenHash });
}

export function deleteExpiredSessions(db: Db, now: number): void {
  run(db, 'DELETE FROM sessions WHERE expires_at <= :now', { now });
}
