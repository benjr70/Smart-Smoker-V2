/**
 * The touchscreen following the appearance chosen for the installation.
 *
 * The device is a reader and only a reader: it renders the value a browser
 * resolved on its behalf, at boot and again whenever one is announced, and it
 * has nothing of its own to contribute — no operating-system preference to
 * consult, no operator sitting at it, and no write path at all. These tests
 * inject both the boot read and the announcement channel, so what the device
 * does with them is stated here rather than through HTTP and a socket.
 */
import { AppearancePreference, ColorScheme } from 'theme/src';
import { createDeviceAppearanceAdapter } from './deviceAppearance';

/**
 * A backend whose reads this test resolves by hand.
 *
 * Every read is kept, not just the last: the device reads again whenever the
 * channel comes back, so how it behaves depends on which read answers and in
 * what order.
 */
const createPendingBackend = () => {
  const reads: Array<{
    settle: (value: AppearancePreference) => void;
    fail: (reason: Error) => void;
  }> = [];
  return {
    get: () =>
      new Promise<AppearancePreference>((resolve, reject) => {
        reads.push({ settle: resolve, fail: reject });
      }),
    /** Answer a read — the newest unless another is named — with what is stored. */
    answer: (preference: AppearancePreference, at = reads.length - 1) =>
      reads[at].settle(preference),
    /** Fail one, as a device with no route to the cloud would. */
    reject: (reason = new Error('unreachable'), at = reads.length - 1) => reads[at].fail(reason),
    /** How many times the device has asked. */
    asked: () => reads.length,
  };
};

/** Let the adapter's promise chain settle without advancing any clock. */
const flush = async (): Promise<void> => {
  for (let turn = 0; turn < 10; turn++) {
    await Promise.resolve();
  }
};

/** Every scheme the device was asked to render in, in order. */
const createPanel = () => {
  const painted: ColorScheme[] = [];
  return { apply: (scheme: ColorScheme) => painted.push(scheme), painted };
};

describe('what the device renders at boot', () => {
  it('is the value the installation resolved for it', async () => {
    const panel = createPanel();
    const backend = createPendingBackend();
    const adapter = createDeviceAppearanceAdapter({ client: backend, apply: panel.apply });

    const booted = adapter.start();
    backend.answer({ mode: 'system', resolvedMode: 'dark' });
    await booted;

    expect(panel.painted).toEqual(['dark']);
  });
});

/**
 * The device boots when the wifi comes back, and sometimes it does not come
 * back. Nothing is on the panel to interpret an absence, so the scheme it
 * booted in — dark, the one a garage is lit for — simply stands.
 */
describe('a backend the device cannot reach', () => {
  it('leaves the panel in the scheme it booted in', async () => {
    const panel = createPanel();
    const backend = createPendingBackend();
    const adapter = createDeviceAppearanceAdapter({ client: backend, apply: panel.apply });

    const booted = adapter.start();
    backend.reject();
    await booted;

    expect(panel.painted).toEqual([]);
  });

  it('does not make the failure the caller’s problem', async () => {
    const panel = createPanel();
    const backend = createPendingBackend();
    const adapter = createDeviceAppearanceAdapter({ client: backend, apply: panel.apply });

    const booted = adapter.start();
    backend.reject();

    await expect(booted).resolves.toBeUndefined();
  });
});

/**
 * The channel a browser's choice reaches the garage on. The device is nowhere
 * near anyone who could reload it, so an announcement has to land on the screen
 * as it is.
 */
const createChannel = () => {
  const listeners: Array<(preference: AppearancePreference) => void> = [];
  const connections: Array<() => void> = [];
  return {
    subscribe: (listener: (preference: AppearancePreference) => void, onConnected?: () => void) => {
      listeners.push(listener);
      if (onConnected) {
        connections.push(onConnected);
      }
      return () => {
        listeners.splice(listeners.indexOf(listener), 1);
        if (onConnected) {
          connections.splice(connections.indexOf(onConnected), 1);
        }
      };
    },
    announce: (preference: AppearancePreference) =>
      listeners.forEach(listener => listener(preference)),
    /** The channel came up — for the first time, or after the wifi came back. */
    connect: () => connections.forEach(listener => listener()),
    listening: () => listeners.length,
  };
};

describe('a preference a browser changed while the device is running', () => {
  it('is rendered without the device being reloaded', async () => {
    const panel = createPanel();
    const backend = createPendingBackend();
    const channel = createChannel();
    const adapter = createDeviceAppearanceAdapter({
      client: backend,
      subscription: channel,
      apply: panel.apply,
    });
    const booted = adapter.start();
    backend.answer({ mode: 'dark', resolvedMode: 'dark' });
    await booted;

    channel.announce({ mode: 'light', resolvedMode: 'light' });

    expect(panel.painted).toEqual(['dark', 'light']);
  });

  /**
   * The boot read is as slow as the tailnet is, and the device boots when the
   * wifi comes back — which is exactly when a browser's change may be arriving.
   * The announcement is the later word, so an answer already on its way must not
   * repaint the panel back to what the installation held a moment ago.
   */
  it('is not undone by a read that was already on its way', async () => {
    const panel = createPanel();
    const backend = createPendingBackend();
    const channel = createChannel();
    const adapter = createDeviceAppearanceAdapter({
      client: backend,
      subscription: channel,
      apply: panel.apply,
    });

    const booted = adapter.start();
    channel.announce({ mode: 'light', resolvedMode: 'light' });
    backend.answer({ mode: 'dark', resolvedMode: 'dark' });
    await booted;

    expect(panel.painted).toEqual(['light']);
  });

  it('stops reaching a device that has been stopped', async () => {
    const panel = createPanel();
    const backend = createPendingBackend();
    const channel = createChannel();
    const adapter = createDeviceAppearanceAdapter({
      client: backend,
      subscription: channel,
      apply: panel.apply,
    });
    const booted = adapter.start();
    backend.answer({ mode: 'dark', resolvedMode: 'dark' });
    await booted;

    adapter.stop();
    channel.announce({ mode: 'light', resolvedMode: 'light' });

    expect(panel.painted).toEqual(['dark']);
    expect(channel.listening()).toBe(0);
  });
});

/**
 * The boot read is one attempt at one moment, and this appliance is switched on
 * with the smoker — often before the tailnet is up — on a wifi link that drops
 * routinely. Nobody is in the garage to reload it, and the backend announces
 * only to the clients connected at the time, so anything missed while the link
 * was down would otherwise stand until the next boot, which may be next
 * weekend. Every time the channel comes up the device therefore asks again: the
 * one moment it is certain of having missed nothing is the moment it is
 * connected.
 */
describe('a device whose link to the cloud comes back', () => {
  const bootWith = (channel: ReturnType<typeof createChannel>) => {
    const panel = createPanel();
    const backend = createPendingBackend();
    const adapter = createDeviceAppearanceAdapter({
      client: backend,
      subscription: channel,
      apply: panel.apply,
    });
    return { panel, backend, adapter };
  };

  it('asks again after a boot read that could not be made', async () => {
    const channel = createChannel();
    const { panel, backend, adapter } = bootWith(channel);
    const booted = adapter.start();
    backend.reject();
    await booted;
    expect(panel.painted).toEqual([]);

    channel.connect();
    backend.answer({ mode: 'light', resolvedMode: 'light' });
    await flush();

    expect(panel.painted).toEqual(['light']);
  });

  /**
   * A choice made on a phone while the garage was offline was announced to
   * whoever was listening, which was nobody here. Re-reading on the way back is
   * what turns that miss into a delay.
   */
  it('catches up on a preference announced while it was away', async () => {
    const channel = createChannel();
    const { panel, backend, adapter } = bootWith(channel);
    const booted = adapter.start();
    backend.answer({ mode: 'dark', resolvedMode: 'dark' });
    await booted;

    channel.connect();
    backend.answer({ mode: 'light', resolvedMode: 'light' });
    await flush();

    expect(panel.painted).toEqual(['dark', 'light']);
  });

  /**
   * A read made before the link came back can answer after the one made once it
   * had — the first was queued on a socket nobody was reading. The later read
   * asked the newer question, so the earlier answer has nothing left to say.
   */
  it('is not repainted by an older read answering last', async () => {
    const channel = createChannel();
    const { panel, backend, adapter } = bootWith(channel);
    const booted = adapter.start();

    channel.connect();
    backend.answer({ mode: 'light', resolvedMode: 'light' });
    backend.answer({ mode: 'dark', resolvedMode: 'dark' }, 0);
    await booted;
    await flush();

    expect(panel.painted).toEqual(['light']);
  });

  it('asks nothing more once the device has been stopped', async () => {
    const channel = createChannel();
    const { backend, adapter } = bootWith(channel);
    const booted = adapter.start();
    backend.answer({ mode: 'dark', resolvedMode: 'dark' });
    await booted;

    adapter.stop();
    channel.connect();
    await flush();

    expect(backend.asked()).toBe(1);
  });

  /**
   * The tree a stopped adapter would repaint is being torn down, so an answer
   * that arrives after it has nothing to paint.
   */
  it('does not paint a stopped device with an answer that was still on its way', async () => {
    const channel = createChannel();
    const { panel, backend, adapter } = bootWith(channel);
    const booted = adapter.start();

    adapter.stop();
    backend.answer({ mode: 'light', resolvedMode: 'light' });
    await booted;

    expect(panel.painted).toEqual([]);
  });
});
