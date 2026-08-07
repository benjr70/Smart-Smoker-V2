/**
 * The touchscreen following the appearance chosen for the installation.
 *
 * The device cannot resolve an appearance: its panel reports light however dark
 * the garage is, and there is no operator sitting at it to choose. So it renders
 * the value some browser resolved and recorded — read at boot, replaced whenever
 * the backend announces a new one, and read again whenever the channel comes
 * back up — and contributes nothing back. There is no write path here to
 * disable, because there is none at all.
 *
 * The read and the announcement channel are both injected, so the device's
 * behaviour is a matter of what it does with two small interfaces rather than of
 * HTTP and a socket.
 */
import { AppearancePreference, ColorScheme, resolveAppearance } from 'theme/src';

/**
 * Reading the installation's stored preference.
 *
 * Read-only on purpose: the device has nothing to write, so it is handed nothing
 * to write with.
 */
export interface DeviceAppearanceReadPort {
  get(): Promise<AppearancePreference>;
}

/**
 * How the device hears that a browser changed the preference. Carried in
 * production by the appearance event on the backend's websocket.
 */
export interface DeviceAppearanceSubscriptionPort {
  /**
   * Register a listener, and hand back the way to stop listening.
   *
   * `onConnected` is called every time the channel comes up — the first time and
   * after every drop — because an announcement is only delivered to whoever was
   * connected when it was made. This appliance is switched on with the smoker,
   * often before the tailnet is, on a wifi link that drops routinely, and nobody
   * is in the garage to reload it; the moment the channel is up is the moment it
   * is worth asking what was missed. A channel that cannot say (a device
   * assembled without one, or a test that does not care) simply never triggers
   * one, and the device is left with what it read at boot.
   */
  subscribe(
    listener: (preference: AppearancePreference) => void,
    onConnected?: () => void
  ): () => void;
}

/** A channel that never delivers anything, for a device assembled without one. */
export const noDeviceAppearanceSubscription: DeviceAppearanceSubscriptionPort = {
  subscribe: () => () => undefined,
};

export interface DeviceAppearanceDependencies {
  client: DeviceAppearanceReadPort;
  subscription?: DeviceAppearanceSubscriptionPort;
  /** Render in this scheme from now on. */
  apply(colorScheme: ColorScheme): void;
}

export interface DeviceAppearanceAdapter {
  /**
   * Listen for announcements and read what the installation currently holds.
   * Resolves when that first read has settled; nothing on screen changes before
   * it does. Later reads — one per time the channel comes up — happen on their
   * own, and nobody is waiting on them.
   */
  start(): Promise<void>;
  /** Stop listening, and stop asking. */
  stop(): void;
}

export const createDeviceAppearanceAdapter = ({
  client,
  subscription = noDeviceAppearanceSubscription,
  apply,
}: DeviceAppearanceDependencies): DeviceAppearanceAdapter => {
  /**
   * Paint what a preference means *to a device*: the recorded resolved half,
   * never the chosen mode. Asked through the shared rule rather than read off
   * the field, so the device cannot drift away from what every other client
   * agrees the preference means.
   */
  const applyPreference = (stored: AppearancePreference): void => {
    apply(resolveAppearance({ stored, client: 'device' }).colorScheme);
  };

  let unsubscribe: (() => void) | undefined;

  /**
   * How many preferences have been announced. The boot read is as slow as the
   * tailnet is, and the device boots when the wifi comes back — which is exactly
   * when a browser's change may be arriving. An announcement is the later word,
   * so a read that was already on its way when one landed has nothing left to
   * say, and applying it would repaint the panel back to what the installation
   * held a moment ago.
   */
  let announced = 0;

  const adopt = (preference: AppearancePreference): void => {
    announced += 1;
    applyPreference(preference);
  };

  /**
   * How many reads have been made. A read made before the link came back can
   * answer after one made once it had — the first was queued on a socket nobody
   * was reading — and the later read asked the newer question, so an earlier
   * answer arriving last has nothing left to say.
   */
  let asked = 0;

  /**
   * Ask what the installation currently holds, and paint it unless something
   * newer has already been painted.
   *
   * A backend this appliance cannot reach is not a failure anyone is standing in
   * front of it to see, and not a reason to change what is on the panel: the
   * scheme it booted in goes on applying until an answer arrives. Swallowing the
   * read is therefore the behaviour, not a shortcut — but it is only tolerable
   * because the read is made again every time the channel comes up, which is
   * what keeps a kiosk nobody ever reboots from wearing a failed boot read for a
   * week.
   */
  const read = async (): Promise<void> => {
    const began = announced;
    const attempt = (asked += 1);
    const fetched = await client.get().catch(() => null);
    if (fetched === null || announced !== began || attempt !== asked) {
      return;
    }
    applyPreference(fetched);
  };

  return {
    start: async () => {
      unsubscribe = unsubscribe ?? subscription.subscribe(adopt, () => void read());
      await read();
    },
    stop: () => {
      unsubscribe?.();
      unsubscribe = undefined;
      // An answer still on its way belongs to a device that is no longer there
      // — the tree it would repaint is being torn down. Counting a read nobody
      // made retires it by the same rule that retires an overtaken one.
      asked += 1;
    },
  };
};
