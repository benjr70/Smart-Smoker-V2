/**
 * Browser-backed push port — the production implementation of {@link PushPort}.
 *
 * This is the ONLY module allowed to touch `navigator.serviceWorker`,
 * `window.Notification` and `PushManager`. Isolating them here is what lets the
 * settings components be tested against a fake port instead of stubbed browser
 * globals.
 */
import { PushSubscriptionPayload } from '../api/types';
import { PushPermission, PushPort } from './pushPort';

/**
 * The VAPID key arrives as URL-safe base64 (what the backend has in its
 * environment); `PushManager.subscribe` wants the raw bytes.
 */
const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

const isSupported = (): boolean =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  'PushManager' in window &&
  'Notification' in window;

/**
 * Resolve a registration whose worker is **activated**.
 *
 * `navigator.serviceWorker.register()` resolves as soon as the registration
 * exists — on a first visit the worker is still `installing` and
 * `registration.active` is null. `PushManager.subscribe()` rejects against such
 * a registration ("Registration failed - no active Service Worker"), which is
 * exactly the state a clean browser profile is in the first time the user asks
 * for a test notification. `skipWaiting()`/`clients.claim()` in the worker
 * shorten that window but do not close it, so wait for activation here.
 */
const waitForActivation = async (
  registration: ServiceWorkerRegistration
): Promise<ServiceWorkerRegistration> => {
  if (registration.active) {
    return registration;
  }
  const pending = registration.installing || registration.waiting;
  if (!pending) {
    // Nothing to watch (e.g. another tab owns the install): the browser's own
    // `ready` promise settles once an activated registration controls this page.
    return navigator.serviceWorker.ready;
  }
  await new Promise<void>((resolve, reject) => {
    const onStateChange = () => {
      if (pending.state === 'activated') {
        pending.removeEventListener('statechange', onStateChange);
        resolve();
      } else if (pending.state === 'redundant') {
        pending.removeEventListener('statechange', onStateChange);
        reject(new Error('The service worker failed to install.'));
      }
    };
    pending.addEventListener('statechange', onStateChange);
    // The worker may have advanced between `register()` resolving and this
    // listener being attached, in which case no further event is coming.
    onStateChange();
  });
  return registration;
};

const bytesMatch = (a: ArrayBuffer | null | undefined, b: Uint8Array): boolean => {
  if (!a) {
    return false;
  }
  const existing = new Uint8Array(a);
  return existing.length === b.length && existing.every((byte, index) => byte === b[index]);
};

export const createBrowserPushPort = (): PushPort => ({
  getPermission: () =>
    isSupported() ? (window.Notification.permission as PushPermission) : 'unsupported',
  requestPermission: async () => {
    if (!isSupported()) {
      return 'unsupported';
    }
    return (await window.Notification.requestPermission()) as PushPermission;
  },
  subscribe: async (applicationServerKey: string) => {
    if (!isSupported()) {
      throw new Error('Push notifications are not supported in this browser.');
    }
    const registration = await waitForActivation(await navigator.serviceWorker.register('/sw.js'));
    const keyBytes = urlBase64ToUint8Array(applicationServerKey);
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      // A subscription taken out against a different VAPID key can never
      // receive our sends (the push service rejects them), so drop it and take
      // a fresh one. This is what makes a rotated key — or the hermetic e2e
      // stack's own key pair — recoverable without clearing site data.
      if (bytesMatch(existing.options?.applicationServerKey, keyBytes)) {
        return existing.toJSON() as unknown as PushSubscriptionPayload;
      }
      await existing.unsubscribe();
    }
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes,
    });
    return subscription.toJSON() as unknown as PushSubscriptionPayload;
  },
});

let defaultPort: PushPort | undefined;

/**
 * The lazily-constructed browser port used as the React context default, built
 * once on first use so importing this module never touches browser globals.
 */
export const getDefaultPushPort = (): PushPort => {
  if (!defaultPort) {
    defaultPort = createBrowserPushPort();
  }
  return defaultPort;
};
