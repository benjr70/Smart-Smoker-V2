/**
 * Behaviour tests for the shipped service worker.
 *
 * `public/sw.js` is copied verbatim into the build and runs in a worker global
 * scope, so it cannot be imported. These tests load the real file and execute
 * it against a stand-in scope, then drive it with the events the browser would
 * deliver — the artifact that ships is the artifact under test.
 */
import * as fs from 'fs';
import * as path from 'path';

const SERVICE_WORKER_PATH = path.resolve(__dirname, '../../public/sw.js');

interface ShownNotification {
  title: string;
  options: Record<string, unknown>;
}

const loadServiceWorker = () => {
  const handlers: Record<string, (event: unknown) => unknown> = {};
  const shown: ShownNotification[] = [];
  const waited: unknown[] = [];
  const focused: string[] = [];
  const opened: string[] = [];
  let windowClients: { url: string; focus: () => Promise<unknown> }[] = [];

  const scope = {
    addEventListener: (type: string, handler: (event: unknown) => unknown) => {
      handlers[type] = handler;
    },
    skipWaiting: jest.fn().mockResolvedValue(undefined),
    registration: {
      showNotification: jest.fn((title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
        return Promise.resolve();
      }),
    },
    clients: {
      claim: jest.fn().mockResolvedValue(undefined),
      matchAll: jest.fn(() => Promise.resolve(windowClients)),
      openWindow: jest.fn((url: string) => {
        opened.push(url);
        return Promise.resolve(undefined);
      }),
    },
  };

  const source = fs.readFileSync(SERVICE_WORKER_PATH, 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('self', source)(scope);

  return {
    scope,
    shown,
    opened,
    focused,
    setWindowClients: (urls: string[]) => {
      windowClients = urls.map(url => ({
        url,
        focus: () => {
          focused.push(url);
          return Promise.resolve(undefined);
        },
      }));
    },
    dispatch: async (type: string, event: Record<string, unknown> = {}) => {
      const handler = handlers[type];
      if (!handler) {
        throw new Error(`the service worker registered no '${type}' handler`);
      }
      const enriched = {
        waitUntil: (value: unknown) => {
          waited.push(value);
        },
        ...event,
      };
      await handler(enriched);
      await Promise.all(waited);
    },
  };
};

const pushEvent = (payload: unknown) => ({
  data: { text: () => JSON.stringify(payload) },
});

describe('service worker', () => {
  test('a push that arrives with no payload does not throw', async () => {
    const worker = loadServiceWorker();

    await expect(worker.dispatch('push', { data: null })).resolves.not.toThrow();

    // userVisibleOnly subscriptions must always show something, so the guard
    // renders a generic notification rather than skipping the event.
    expect(worker.shown).toHaveLength(1);
  });

  test('renders the title and body from the delivered payload', async () => {
    const worker = loadServiceWorker();

    await worker.dispatch('push', pushEvent({ title: 'Smoker', body: 'Chamber is cold' }));

    expect(worker.shown).toEqual([
      expect.objectContaining({
        title: 'Smoker',
        options: expect.objectContaining({ body: 'Chamber is cold' }),
      }),
    ]);
  });

  test('renders the app icon asset, not a placeholder path', async () => {
    const worker = loadServiceWorker();

    await worker.dispatch('push', pushEvent({ title: 'Smoker', body: 'Chamber is cold' }));

    expect(worker.shown[0].options.icon).toBe('/logo192.png');
  });

  test('a malformed payload renders the default notification instead of throwing', async () => {
    const worker = loadServiceWorker();

    await expect(
      worker.dispatch('push', { data: { text: () => 'not json' } })
    ).resolves.not.toThrow();

    expect(worker.shown).toHaveLength(1);
  });

  test('tapping a notification focuses an app window that is already open', async () => {
    const worker = loadServiceWorker();
    worker.setWindowClients(['https://smoker.example/history']);

    await worker.dispatch('notificationclick', {
      notification: { close: jest.fn(), data: { url: '/' } },
    });

    expect(worker.focused).toEqual(['https://smoker.example/history']);
    expect(worker.opened).toEqual([]);
  });

  test('tapping a notification opens a window when none is open', async () => {
    const worker = loadServiceWorker();
    worker.setWindowClients([]);

    await worker.dispatch('notificationclick', {
      notification: { close: jest.fn(), data: { url: '/' } },
    });

    expect(worker.opened).toEqual(['/']);
  });

  test('takes control of open tabs on activation', async () => {
    const worker = loadServiceWorker();

    await worker.dispatch('activate');

    expect(worker.scope.clients.claim).toHaveBeenCalled();
  });
});
