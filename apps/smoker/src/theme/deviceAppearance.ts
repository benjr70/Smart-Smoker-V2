/**
 * The touchscreen following the appearance chosen for the installation.
 *
 * The device cannot resolve an appearance: its panel reports light however dark
 * the garage is, and there is no operator sitting at it to choose. So it renders
 * the value some browser resolved and recorded — read once at boot and replaced
 * whenever the backend announces a new one — and contributes nothing back. There
 * is no write path here to disable, because there is none at all.
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
  /** Register a listener, and hand back the way to stop listening. */
  subscribe(listener: (preference: AppearancePreference) => void): () => void;
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
   * Resolves when that read has settled; nothing on screen changes before it
   * does.
   */
  start(): Promise<void>;
  /** Stop listening. */
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

  return {
    start: async () => {
      unsubscribe = unsubscribe ?? subscription.subscribe(adopt);
      const began = announced;
      // A backend this appliance cannot reach is not a failure anyone is
      // standing in front of it to see, and not a reason to change what is on
      // the panel: the scheme it booted in goes on applying, and the next
      // announcement — or the next boot — corrects it. Swallowing the read is
      // therefore the behaviour, not a shortcut.
      const fetched = await client.get().catch(() => null);
      if (fetched === null || announced !== began) {
        return;
      }
      applyPreference(fetched);
    },
    stop: () => {
      unsubscribe?.();
      unsubscribe = undefined;
    },
  };
};
