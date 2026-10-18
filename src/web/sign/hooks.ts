import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MINUTE } from '../../shared/time.ts';
import { checkForUpdate, hasServiceWorker, installUpdate, onUpdateWaiting } from '../lib/pwa.ts';
import { readStored, writeStored } from '../lib/storage.ts';

/** Current time corrected by the server offset, ticking on each second. */
export function useNow(offset: number): number {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now() + offset;
      setNow(t);
      timer = setTimeout(tick, 1000 - (t % 1000) + 5);
    };
    tick();
    return () => clearTimeout(timer);
  }, [offset]);
  return now;
}

/** Height of an element in rem, kept up to date as the screen or layout changes. */
export function useRemHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setHeight(element.clientHeight / rem);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, height] as const;
}

/** Whether the sign can reload without ending up on a blank page. */
export function canReload(): boolean {
  return navigator.onLine || hasServiceWorker();
}

function msUntil(hour: number, minute: number): number {
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  return next.getTime() - Date.now();
}

/**
 * Unattended screen (SIGN-5): sign sizing and no cursor, screen kept awake, and a reload every night
 * to start each day fresh.
 */
export function useKiosk(): void {
  useEffect(() => {
    document.documentElement.classList.add('sign-mode');

    let lock: WakeLockSentinel | undefined;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock?.request('screen');
      } catch {
        // Not supported or not allowed: the kiosk's power settings must handle it.
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVisible);

    const nightly = setTimeout(() => canReload() && location.reload(), msUntil(3, 30));

    return () => {
      document.documentElement.classList.remove('sign-mode');
      void lock?.release();
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(nightly);
    };
  }, []);
}

const RELOAD_KEY = 'sign.reloadingFor';
const RELOAD_RETRY = 10 * MINUTE;

/**
 * Reloads into the new version when the server reports one (SIGN-6). The service worker is asked to
 * fetch it first, so the reload works offline afterwards; a plain reload is the fallback. Attempts
 * for the same version are spaced out so a broken deploy can't cause a reload loop.
 */
export function useSelfUpdate(serverVersion: string | undefined, lastContactAt: number | null): void {
  useEffect(() => onUpdateWaiting(installUpdate), []);

  useEffect(() => {
    if (!serverVersion || serverVersion === 'dev' || __APP_VERSION__ === 'dev' || serverVersion === __APP_VERSION__) return;
    const last = readStored<{ version: string; at: number }>(RELOAD_KEY);
    if (last?.version === serverVersion && Date.now() - last.at < RELOAD_RETRY) return;
    writeStored(RELOAD_KEY, { version: serverVersion, at: Date.now() });

    // Not cancelled on re-render: once decided, the reload must happen.
    void checkForUpdate().then((checking) => {
      // With a service worker, the update normally reloads the page by itself well within this delay.
      setTimeout(() => location.reload(), checking ? 30_000 : 0);
    });
  }, [serverVersion, lastContactAt]);
}
