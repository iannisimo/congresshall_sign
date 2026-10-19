import { useEffect, useRef, useState } from 'react';
import type { DisplaySnapshot } from '../../shared/model.ts';
import { readStored, writeStored } from '../lib/storage.ts';

export const POLL_INTERVAL = 60_000;

/** The carousel preset from the URL (?preset=bar); null for the default one. */
const PRESET = new URLSearchParams(location.search).get('preset') || null;
// A screen whose URL changes must not start from another preset's snapshot; the default keeps the old key.
const SNAPSHOT_KEY = PRESET ? `sign.snapshot:${PRESET}` : 'sign.snapshot';
const CONTACT_KEY = 'sign.lastContactAt';
const OFFSET_KEY = 'sign.clockOffset';

interface Stored {
  snapshot: DisplaySnapshot;
  etag: string | null;
}

export interface SnapshotState {
  snapshot: DisplaySnapshot | null;
  /** Server time of the last successful poll, changed or not. */
  lastContactAt: number | null;
  /** Add to Date.now() to get the server's time. */
  clockOffset: number;
}

/**
 * Server clock offset from the Date header. The header has 1 s resolution, so assume the middle of
 * that second, at the middle of the round trip. Changes under a second are noise and are ignored.
 */
function nextOffset(previous: number, dateHeader: string | null, sentAt: number, receivedAt: number): number {
  const serverTime = dateHeader ? Date.parse(dateHeader) : NaN;
  if (Number.isNaN(serverTime)) return previous;
  const offset = Math.round(serverTime + 500 - (sentAt + receivedAt) / 2);
  return Math.abs(offset - previous) < 1000 ? previous : offset;
}

/**
 * Polls GET /api/display every minute with If-None-Match, keeps the last snapshot in localStorage so the
 * sign starts and keeps working offline, and tracks the server's clock (SYNC-1, SYNC-2, SIGN-7).
 */
export function useSnapshot(): SnapshotState {
  const [state, setState] = useState<SnapshotState>(() => ({
    snapshot: readStored<Stored>(SNAPSHOT_KEY)?.snapshot ?? null,
    lastContactAt: readStored<number>(CONTACT_KEY) ?? null,
    clockOffset: readStored<number>(OFFSET_KEY) ?? 0,
  }));
  const etag = useRef(readStored<Stored>(SNAPSHOT_KEY)?.etag ?? null);
  const offset = useRef(state.clockOffset);

  useEffect(() => {
    let inFlight = false;

    async function poll() {
      if (inFlight) return;
      inFlight = true;
      try {
        const sentAt = Date.now();
        const response = await fetch(PRESET ? `/api/display?preset=${encodeURIComponent(PRESET)}` : '/api/display', {
          cache: 'no-store',
          headers: etag.current ? { 'If-None-Match': etag.current } : {},
        });
        const receivedAt = Date.now();
        if (response.status !== 304 && !response.ok) return;

        offset.current = nextOffset(offset.current, response.headers.get('date'), sentAt, receivedAt);
        const lastContactAt = receivedAt + offset.current;
        writeStored(OFFSET_KEY, offset.current);
        writeStored(CONTACT_KEY, lastContactAt);

        if (response.status === 304) {
          setState((s) => ({ ...s, lastContactAt, clockOffset: offset.current }));
          return;
        }
        const snapshot = (await response.json()) as DisplaySnapshot;
        etag.current = response.headers.get('etag');
        writeStored(SNAPSHOT_KEY, { snapshot, etag: etag.current } satisfies Stored);
        setState({ snapshot, lastContactAt, clockOffset: offset.current });
      } catch {
        // Offline or server down: keep showing the last snapshot. The "last update" note tells.
      } finally {
        inFlight = false;
      }
    }

    void poll();
    const timer = setInterval(poll, POLL_INTERVAL);
    const onOnline = () => void poll();
    const onVisible = () => document.visibilityState === 'visible' && void poll();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return state;
}
