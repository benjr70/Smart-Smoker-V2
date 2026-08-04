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

/** A backend whose read this test resolves by hand. */
const createPendingBackend = () => {
  let settle: (value: AppearancePreference) => void = () => undefined;
  let fail: (reason: Error) => void = () => undefined;
  return {
    get: () =>
      new Promise<AppearancePreference>((resolve, reject) => {
        settle = resolve;
        fail = reject;
      }),
    /** Answer the pending read with what the installation has stored. */
    answer: (preference: AppearancePreference) => settle(preference),
    /** Fail the pending read, as a device with no route to the cloud would. */
    reject: (reason = new Error('unreachable')) => fail(reason),
  };
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
