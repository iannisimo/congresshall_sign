import { registerSW } from 'virtual:pwa-register';

// The service worker waits when a new version is available ("prompt" mode): the sign applies it right
// away, the admin area asks first so nobody loses a half-filled form.

type Listener = () => void;

let registration: ServiceWorkerRegistration | undefined;
let updateWaiting = false;
const listeners = new Set<Listener>();

const applyUpdate = registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    registration = reg;
  },
  onNeedRefresh() {
    updateWaiting = true;
    listeners.forEach((listener) => listener());
  },
});

/** Calls `listener` when a new version is installed and waiting. */
export function onUpdateWaiting(listener: Listener): () => void {
  listeners.add(listener);
  if (updateWaiting) listener();
  return () => listeners.delete(listener);
}

/** Activates the waiting version; the page then reloads itself. */
export function installUpdate(): void {
  void applyUpdate(true);
}

/** Asks the browser to look for a new service worker now, instead of at the next navigation. */
export async function checkForUpdate(): Promise<boolean> {
  if (!registration) return false;
  try {
    await registration.update();
    return true;
  } catch {
    return false;
  }
}

export function hasServiceWorker(): boolean {
  return 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
}
