import { createBrowserPushPort, getDefaultPushPort } from './browserPushAdapter';

const subscriptionJson = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/browser-endpoint',
  expirationTime: null,
  keys: { p256dh: 'browser-p256dh', auth: 'browser-auth' },
};

// A URL-safe base64 VAPID key (the form the backend serves).
const VAPID_KEY = 'BJ2-abc_defGHI';

const asKeyBytes = (key: string): Uint8Array => {
  const padded = key + '='.repeat((4 - (key.length % 4)) % 4);
  const raw = window.atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, character => character.charCodeAt(0));
};

interface FakeBrowser {
  register: jest.Mock;
  subscribe: jest.Mock;
  getSubscription: jest.Mock;
  unsubscribe: jest.Mock;
  /** Drive the installing worker's lifecycle, as the browser would. */
  advanceWorkerTo: (state: 'activated' | 'redundant') => void;
}

/**
 * @param options.worker how the registration comes back from `register()`:
 *   - `activated` (default): a worker is already running, as on a repeat visit.
 *   - `installing`: a first visit — `register()` resolves while the worker is
 *     still installing, so `registration.active` is null. `PushManager` rejects
 *     in this state, which is why the adapter must wait for activation.
 *   - `none`: neither active nor installing/waiting, the case that falls back to
 *     `navigator.serviceWorker.ready`.
 */
const installBrowser = (
  options: {
    existing?: { applicationServerKey?: Uint8Array } | null;
    worker?: 'activated' | 'installing' | 'none';
  } = {}
): FakeBrowser => {
  const unsubscribe = jest.fn().mockResolvedValue(true);
  const existing =
    options.existing === undefined || options.existing === null
      ? null
      : {
          options: { applicationServerKey: options.existing.applicationServerKey?.buffer },
          unsubscribe,
          toJSON: () => ({ ...subscriptionJson, endpoint: 'https://existing.example/endpoint' }),
        };
  const subscribe = jest.fn().mockResolvedValue({ toJSON: () => subscriptionJson });
  const getSubscription = jest.fn().mockResolvedValue(existing);

  const stateListeners: (() => void)[] = [];
  const installingWorker = {
    state: 'installing',
    addEventListener: (type: string, handler: () => void) => {
      if (type === 'statechange') {
        stateListeners.push(handler);
      }
    },
    removeEventListener: (type: string, handler: () => void) => {
      const index = stateListeners.indexOf(handler);
      if (index !== -1) {
        stateListeners.splice(index, 1);
      }
    },
  };
  const mode = options.worker ?? 'activated';
  const registration: Record<string, unknown> = {
    active: mode === 'activated' ? { state: 'activated' } : null,
    installing: mode === 'installing' ? installingWorker : null,
    waiting: null,
    pushManager: { subscribe, getSubscription },
  };
  const register = jest.fn().mockResolvedValue(registration);
  // The browser's `ready` promise only settles once an activated registration
  // controls the page; the fake settles it when the worker activates.
  let resolveReady: (value: unknown) => void = () => undefined;
  const ready =
    mode === 'activated'
      ? Promise.resolve(registration)
      : new Promise(resolve => {
          resolveReady = resolve;
        });

  Object.defineProperty(navigator, 'serviceWorker', {
    value: { register, ready },
    configurable: true,
  });
  Object.defineProperty(window, 'PushManager', { value: function () {}, configurable: true });
  Object.defineProperty(window, 'Notification', {
    value: { requestPermission: jest.fn().mockResolvedValue('granted') },
    configurable: true,
  });

  return {
    register,
    subscribe,
    getSubscription,
    unsubscribe,
    advanceWorkerTo: (state: 'activated' | 'redundant') => {
      installingWorker.state = state;
      if (state === 'activated') {
        registration.active = installingWorker;
        registration.installing = null;
        resolveReady(registration);
      }
      [...stateListeners].forEach(listener => listener());
    },
  };
};

/** Let pending promise callbacks run without resolving anything of our own. */
const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

const uninstallBrowser = () => {
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  delete (window as unknown as Record<string, unknown>).PushManager;
  delete (window as unknown as Record<string, unknown>).Notification;
};

afterEach(uninstallBrowser);

describe('browserPushAdapter', () => {
  test('getPermission reports what the browser already permits, without prompting', () => {
    installBrowser();
    (window as any).Notification.permission = 'denied';

    expect(createBrowserPushPort().getPermission()).toBe('denied');
    expect((window as any).Notification.requestPermission).not.toHaveBeenCalled();
  });

  test('getPermission reports unsupported on a browser without push', () => {
    uninstallBrowser();

    expect(createBrowserPushPort().getPermission()).toBe('unsupported');
  });

  test('requestPermission reports what the browser prompt returned', async () => {
    installBrowser();
    (window as any).Notification.requestPermission.mockResolvedValue('denied');

    await expect(createBrowserPushPort().requestPermission()).resolves.toBe('denied');
  });

  test('requestPermission reports unsupported instead of throwing on a browser without push', async () => {
    uninstallBrowser();

    await expect(createBrowserPushPort().requestPermission()).resolves.toBe('unsupported');
  });

  test('subscribe registers the service worker and subscribes with the given key', async () => {
    const browser = installBrowser();

    const subscription = await createBrowserPushPort().subscribe(VAPID_KEY);

    expect(browser.register).toHaveBeenCalledWith('/sw.js');
    expect(browser.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: asKeyBytes(VAPID_KEY),
    });
    expect(subscription).toEqual(subscriptionJson);
  });

  test('subscribe waits for a freshly installed worker to activate before touching PushManager', async () => {
    // First visit: register() resolves while the worker is still installing, so
    // registration.active is null. PushManager.subscribe rejects with
    // "no active Service Worker" in that state, so the adapter must wait.
    const browser = installBrowser({ worker: 'installing' });

    const pending = createBrowserPushPort().subscribe(VAPID_KEY);
    await flushMicrotasks();

    expect(browser.register).toHaveBeenCalledWith('/sw.js');
    expect(browser.getSubscription).not.toHaveBeenCalled();
    expect(browser.subscribe).not.toHaveBeenCalled();

    browser.advanceWorkerTo('activated');

    await expect(pending).resolves.toEqual(subscriptionJson);
    expect(browser.subscribe).toHaveBeenCalled();
  });

  test('subscribe rejects when the worker fails to install', async () => {
    const browser = installBrowser({ worker: 'installing' });

    const pending = createBrowserPushPort().subscribe(VAPID_KEY);
    await flushMicrotasks();
    browser.advanceWorkerTo('redundant');

    await expect(pending).rejects.toThrow(/service worker/i);
    expect(browser.subscribe).not.toHaveBeenCalled();
  });

  test('subscribe falls back to the ready registration when there is no worker to watch', async () => {
    const browser = installBrowser({ worker: 'none' });

    const pending = createBrowserPushPort().subscribe(VAPID_KEY);
    await flushMicrotasks();
    expect(browser.subscribe).not.toHaveBeenCalled();

    // `navigator.serviceWorker.ready` settles once an activated registration
    // controls the page.
    browser.advanceWorkerTo('activated');

    await expect(pending).resolves.toEqual(subscriptionJson);
  });

  test('subscribe reuses a subscription already taken out with the same key', async () => {
    const browser = installBrowser({ existing: { applicationServerKey: asKeyBytes(VAPID_KEY) } });

    const subscription = await createBrowserPushPort().subscribe(VAPID_KEY);

    expect(browser.subscribe).not.toHaveBeenCalled();
    expect(subscription.endpoint).toBe('https://existing.example/endpoint');
  });

  test('subscribe replaces a subscription taken out with a different key', async () => {
    const browser = installBrowser({
      existing: { applicationServerKey: asKeyBytes('BOtherKey_x') },
    });

    const subscription = await createBrowserPushPort().subscribe(VAPID_KEY);

    expect(browser.unsubscribe).toHaveBeenCalled();
    expect(browser.subscribe).toHaveBeenCalled();
    expect(subscription).toEqual(subscriptionJson);
  });

  test('subscribe replaces an existing subscription that carries no key', async () => {
    const browser = installBrowser({ existing: {} });

    await createBrowserPushPort().subscribe(VAPID_KEY);

    expect(browser.unsubscribe).toHaveBeenCalled();
    expect(browser.subscribe).toHaveBeenCalled();
  });

  test('subscribe rejects on a browser without push support', async () => {
    uninstallBrowser();

    await expect(createBrowserPushPort().subscribe(VAPID_KEY)).rejects.toThrow(/not supported/i);
  });

  test('the default port is constructed once and shared', () => {
    installBrowser();

    expect(getDefaultPushPort()).toBe(getDefaultPushPort());
  });
});
