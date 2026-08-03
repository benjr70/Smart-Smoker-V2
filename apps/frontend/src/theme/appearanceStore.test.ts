/**
 * The shared appearance preference, as behaviour rather than as plumbing.
 *
 * Everything the store touches — the local cache that decides the first paint,
 * the backend it synchronises with, and the channel other clients announce
 * changes on — is injected, so these tests state what an operator would see: the
 * page keeps the colour it had, or changes to the one somebody else chose, and
 * the backend hears about a choice exactly when there is something new to tell
 * it.
 */
import { AppearanceMode, AppearancePreference, DEFAULT_APPEARANCE_PREFERENCE } from 'theme/src';
import { createAppearanceStore } from './appearanceStore';

/**
 * The local cache and the device setting: what this browser paints from before
 * anything is fetched, and what it remembers afterwards.
 */
const createCache = (mode: AppearanceMode | null = null, systemDark = false) => {
  let current = mode;
  const applied: AppearanceMode[] = [];
  return {
    readMode: () => current,
    systemDark: () => systemDark,
    apply: (chosen: AppearanceMode) => {
      current = chosen;
      applied.push(chosen);
    },
    /** Every mode the store asked to be painted, in order. */
    applied,
    /** What this browser would paint right now. */
    inEffect: () => current,
  };
};

/**
 * A backend whose read this test resolves by hand.
 *
 * Its read answers with a preference or fails, exactly as the real one can: an
 * installation nobody has chosen an appearance on holds the documented default,
 * so there is no third "nothing stored" answer to model.
 */
const createPendingClient = (stored: AppearancePreference = DEFAULT_APPEARANCE_PREFERENCE) => {
  let settle: (value: AppearancePreference) => void = () => undefined;
  let fail: (reason: Error) => void = () => undefined;
  const written: AppearancePreference[] = [];
  return {
    get: () =>
      new Promise<AppearancePreference>((resolve, reject) => {
        settle = resolve;
        fail = reject;
      }),
    save: async (preference: AppearancePreference) => {
      written.push(preference);
      return preference;
    },
    /** Answer the pending read with what the installation has stored. */
    answer: (preference: AppearancePreference = stored) => settle(preference),
    /** Fail the pending read, as an unreachable backend would. */
    reject: (reason = new Error('unreachable')) => fail(reason),
    /** Every preference written to the backend, in order. */
    written,
  };
};

/** Let the store's promise chain settle without advancing any clock. */
const flush = async (): Promise<void> => {
  for (let turn = 0; turn < 10; turn++) {
    await Promise.resolve();
  }
};

const noSubscription = { subscribe: () => () => undefined };

describe('loading the app', () => {
  /**
   * The cache is the render source: the first paint happens before any request
   * could have come back, so the store must not touch what is on screen while
   * it waits. Anything else is the flash of the wrong colour this design exists
   * to prevent.
   */
  it('leaves the cached scheme alone while the stored preference is still on its way', async () => {
    const cache = createCache('dark');
    const client = createPendingClient();
    const store = createAppearanceStore({ cache, client, subscription: noSubscription });

    store.start();
    await flush();

    expect(cache.applied).toEqual([]);
    expect(cache.inEffect()).toBe('dark');
  });

  it('changes to the preference the installation has stored when it differs', async () => {
    const cache = createCache('dark');
    const client = createPendingClient();
    const store = createAppearanceStore({ cache, client, subscription: noSubscription });

    store.start();
    client.answer({ mode: 'light', resolvedMode: 'light' });
    await flush();

    expect(cache.inEffect()).toBe('light');
  });

  it('leaves the page alone when the stored preference is the one already showing', async () => {
    const cache = createCache('dark');
    const client = createPendingClient();
    const store = createAppearanceStore({ cache, client, subscription: noSubscription });

    store.start();
    client.answer({ mode: 'dark', resolvedMode: 'dark' });
    await flush();

    expect(cache.applied).toEqual([]);
  });
});

describe('what a load tells the backend', () => {
  /**
   * Opening the app is not a decision. Two browsers left open on the settings
   * page would otherwise take turns writing the value they already agree on.
   */
  it('writes nothing when the load changed nothing', async () => {
    const cache = createCache('dark');
    const client = createPendingClient();
    const store = createAppearanceStore({ cache, client, subscription: noSubscription });

    store.start();
    client.answer({ mode: 'dark', resolvedMode: 'dark' });
    await flush();

    expect(client.written).toEqual([]);
  });

  /**
   * The device is the other half of "follow the device", and only a browser can
   * read it. A browser whose device has moved away from what is stored is the
   * only thing that can tell the installation — the touchscreen never can.
   */
  it('records what "follow the device" now resolves to on this device', async () => {
    const cache = createCache('system', true);
    const client = createPendingClient();
    const store = createAppearanceStore({ cache, client, subscription: noSubscription });

    store.start();
    client.answer({ mode: 'system', resolvedMode: 'light' });
    await flush();

    expect(client.written).toEqual([{ mode: 'system', resolvedMode: 'dark' }]);
  });
});

/**
 * The backend is a synchronisation channel, not the render source. Losing it
 * costs the installation agreement about the appearance, nothing more — the page
 * in front of the operator still themes correctly.
 */
describe('a backend this client cannot reach', () => {
  it('leaves the cached scheme applied', async () => {
    const cache = createCache('dark');
    const client = createPendingClient();
    const store = createAppearanceStore({ cache, client, subscription: noSubscription });

    store.start();
    client.reject();
    await flush();

    expect(cache.inEffect()).toBe('dark');
    expect(cache.applied).toEqual([]);
  });

  it('does not make the failure the caller’s problem', async () => {
    const cache = createCache('dark');
    const client = createPendingClient();
    const store = createAppearanceStore({ cache, client, subscription: noSubscription });

    const loaded = store.start();
    client.reject();

    await expect(loaded).resolves.toBeUndefined();
  });

  it('still writes a choice made afterwards, so the next load agrees', async () => {
    const cache = createCache('dark');
    const client = createPendingClient();
    const store = createAppearanceStore({ cache, client, subscription: noSubscription });
    store.start();
    client.reject();
    await flush();

    await store.choose('light');

    expect(cache.inEffect()).toBe('light');
    expect(client.written).toEqual([{ mode: 'light', resolvedMode: 'light' }]);
  });
});

/**
 * The load is not instant, and an operator on the settings page has no idea it
 * is happening. Whatever they do while it is in flight is the newer statement of
 * what the installation should look like, so an answer that was already on its
 * way must not undo it.
 */
describe('a choice made while the load is still on its way', () => {
  it('keeps the chosen scheme when the load answers with the older value', async () => {
    const cache = createCache('light');
    const client = createPendingClient();
    const store = createAppearanceStore({ cache, client, subscription: noSubscription });

    store.start();
    await store.choose('dark');
    client.answer({ mode: 'light', resolvedMode: 'light' });
    await flush();

    expect(cache.inEffect()).toBe('dark');
  });

  it('leaves the backend holding the choice rather than the value it answered with', async () => {
    const cache = createCache('light');
    const client = createPendingClient();
    const store = createAppearanceStore({ cache, client, subscription: noSubscription });

    store.start();
    await store.choose('dark');
    client.answer({ mode: 'light', resolvedMode: 'light' });
    await flush();

    expect(client.written).toEqual([{ mode: 'dark', resolvedMode: 'dark' }]);
  });

  /**
   * The choice is what the backend now holds, so choosing it again afterwards
   * is not news — the store must not have gone on believing the value the stale
   * load carried.
   */
  it('writes nothing when that same option is chosen again', async () => {
    const cache = createCache('light');
    const client = createPendingClient();
    const store = createAppearanceStore({ cache, client, subscription: noSubscription });

    store.start();
    await store.choose('dark');
    client.answer({ mode: 'light', resolvedMode: 'light' });
    await flush();

    await store.choose('dark');

    expect(client.written).toEqual([{ mode: 'dark', resolvedMode: 'dark' }]);
  });

  it('keeps a preference another client announced while the load was on its way', async () => {
    const cache = createCache('light');
    const client = createPendingClient();
    const listeners: Array<(preference: AppearancePreference) => void> = [];
    const store = createAppearanceStore({
      cache,
      client,
      subscription: {
        subscribe: listener => {
          listeners.push(listener);
          return () => undefined;
        },
      },
    });

    store.start();
    listeners.forEach(listener => listener({ mode: 'dark', resolvedMode: 'dark' }));
    client.answer({ mode: 'light', resolvedMode: 'light' });
    await flush();

    expect(cache.inEffect()).toBe('dark');
  });
});

describe('choosing an option', () => {
  it('repaints the page and tells the backend', async () => {
    const cache = createCache('system');
    const client = createPendingClient();
    const store = createAppearanceStore({ cache, client, subscription: noSubscription });
    store.start();
    client.answer({ mode: 'system', resolvedMode: 'light' });
    await flush();

    await store.choose('dark');

    expect(cache.inEffect()).toBe('dark');
    expect(client.written).toEqual([{ mode: 'dark', resolvedMode: 'dark' }]);
  });

  it('writes nothing when the option chosen is the one already stored', async () => {
    const cache = createCache('dark');
    const client = createPendingClient();
    const store = createAppearanceStore({ cache, client, subscription: noSubscription });
    store.start();
    client.answer({ mode: 'dark', resolvedMode: 'dark' });
    await flush();

    await store.choose('dark');

    expect(client.written).toEqual([]);
  });

  /**
   * The repaint has already happened by the time the write is attempted, so a
   * write that cannot be delivered costs the installation agreement, not the
   * operator their choice.
   */
  it('keeps the choice on screen when the backend cannot be told about it', async () => {
    const cache = createCache('dark');
    const store = createAppearanceStore({
      cache,
      client: {
        get: async () => DEFAULT_APPEARANCE_PREFERENCE,
        save: async () => {
          throw new Error('unreachable');
        },
      },
      subscription: noSubscription,
    });

    await expect(store.choose('light')).resolves.toBeUndefined();
    expect(cache.inEffect()).toBe('light');
  });
});

/**
 * The channel other clients announce changes on. What carries it is wired in a
 * later slice; the seam is injected, so what the store does with an announcement
 * is stated here rather than left until there is a socket to observe it through.
 */
describe('a preference another client changed', () => {
  const createChannel = () => {
    const listeners: Array<(preference: AppearancePreference) => void> = [];
    return {
      subscribe: (listener: (preference: AppearancePreference) => void) => {
        listeners.push(listener);
        return () => {
          listeners.splice(listeners.indexOf(listener), 1);
        };
      },
      announce: (preference: AppearancePreference) =>
        listeners.forEach(listener => listener(preference)),
      listening: () => listeners.length,
    };
  };

  it('is applied without being written back to the backend it came from', async () => {
    const cache = createCache('light');
    const client = createPendingClient();
    const channel = createChannel();
    const store = createAppearanceStore({ cache, client, subscription: channel });
    store.start();
    client.answer({ mode: 'light', resolvedMode: 'light' });
    await flush();

    channel.announce({ mode: 'dark', resolvedMode: 'dark' });
    await flush();

    expect(cache.inEffect()).toBe('dark');
    expect(client.written).toEqual([]);
  });

  it('stops reaching a store that has been stopped', async () => {
    const cache = createCache('light');
    const client = createPendingClient();
    const channel = createChannel();
    const store = createAppearanceStore({ cache, client, subscription: channel });
    store.start();
    client.answer({ mode: 'light', resolvedMode: 'light' });
    await flush();

    store.stop();
    channel.announce({ mode: 'dark', resolvedMode: 'dark' });
    await flush();

    expect(cache.inEffect()).toBe('light');
    expect(channel.listening()).toBe(0);
  });
});
