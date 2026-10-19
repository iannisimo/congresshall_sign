import { get, run, transaction, type Db } from './db/database.ts';

/** Deletes every event; days, bookings and breaks go with them (cascade). Returns how many events there were. */
export function deleteAllEvents(db: Db, confirmed: boolean): number {
  return transaction(db, () => {
    const count = Number(get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM events')?.n ?? 0);
    if (confirmed && count > 0) run(db, 'DELETE FROM events');
    return count;
  });
}
