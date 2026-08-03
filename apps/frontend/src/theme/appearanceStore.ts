/**
 * The installation-wide appearance preference, kept in step across clients.
 *
 * There are no user accounts here, so the appearance is one value the whole
 * installation shares. Every client still paints from its own local cache first
 * — that is what makes the first paint instant and flash-free — and treats the
 * backend as a synchronisation channel: on load it fetches the stored
 * preference, reconciles it through the shared appearance rule, and applies any
 * difference. A backend it cannot reach changes nothing about what is on screen.
 *
 * Storage, transport and the change channel are all injected. The store's
 * behaviour is therefore a matter of what it does with three small interfaces,
 * which is exactly how it is tested — no live backend, no browser storage and no
 * socket are involved.
 */
import { AppearanceMode, AppearancePreference, resolveChoice } from 'theme/src';

/**
 * This browser's own view of the appearance: what it paints from before
 * anything is fetched, what its device asks for, and how to repaint it.
 * Implemented over the colour-scheme provider, which persists the mode locally.
 */
export interface AppearanceCachePort {
  /** The mode this browser last rendered, or `null` when it has none. */
  readMode(): AppearanceMode | null;
  /** Whether the operating system asks for a dark interface right now. */
  systemDark(): boolean;
  /** Render in this mode from now on, and remember it locally. */
  apply(mode: AppearanceMode): void;
}

/** Reading and writing the installation's stored preference. */
export interface AppearanceClientPort {
  get(): Promise<AppearancePreference | undefined>;
  save(preference: AppearancePreference): Promise<AppearancePreference>;
}

/**
 * How this client hears that another one changed the preference. The channel
 * itself (a websocket event) is wired in a later slice; the seam is here so the
 * store's response to a change is testable without one.
 */
export interface AppearanceSubscriptionPort {
  /** Register a listener, and hand back the way to stop listening. */
  subscribe(listener: (preference: AppearancePreference) => void): () => void;
}

/** A channel that never delivers anything — the default until one is wired. */
export const noAppearanceSubscription: AppearanceSubscriptionPort = {
  subscribe: () => () => undefined,
};

export interface AppearanceStoreDependencies {
  cache: AppearanceCachePort;
  client: AppearanceClientPort;
  subscription?: AppearanceSubscriptionPort;
}

export interface AppearanceStore {
  /**
   * Fetch the stored preference and reconcile it with what this browser is
   * already painting. Resolves when that has settled; nothing on screen changes
   * before it does.
   */
  start(): Promise<void>;
  /** Choose a mode: repaint at once, and tell the backend if this is news. */
  choose(mode: AppearanceMode): Promise<void>;
  /** Stop listening for other clients' changes. */
  stop(): void;
}

export const createAppearanceStore = ({
  cache,
  client,
  subscription = noAppearanceSubscription,
}: AppearanceStoreDependencies): AppearanceStore => {
  /**
   * Paint a preference, if it is not the one already showing. Repainting what
   * is already on screen would be a wasted re-render and, in the local cache, a
   * write of a value that never changed.
   */
  const applyIfDifferent = (mode: AppearanceMode): void => {
    if (cache.readMode() !== mode) {
      cache.apply(mode);
    }
  };

  /**
   * What the store believes the backend holds. Kept so that "is this news?" can
   * be answered without a second read — and so that the answer is about the
   * installation's value rather than about this browser's cache, which may
   * legitimately differ while a device is following its own setting.
   */
  let stored: AppearancePreference | null = null;

  /**
   * Paint a resolution and, if it is news to the backend, publish it.
   *
   * Publishing is deliberately last and deliberately awaited separately from
   * painting: the operator sees the change immediately whatever the backend
   * does about it.
   */
  const reconcile = async (chosen: AppearanceMode): Promise<void> => {
    const resolution = resolveChoice({ chosen, stored, systemDark: cache.systemDark() });

    applyIfDifferent(resolution.preference.mode);

    if (!resolution.shouldPersist) {
      return;
    }
    stored = resolution.preference;
    // The repaint above has already happened, so a write that cannot be
    // delivered costs the installation agreement about the appearance rather
    // than costing the operator their choice. There is nothing to report and
    // nothing to retry: the next load reconciles.
    await client.save(resolution.preference).catch(() => undefined);
  };

  /**
   * Take on a preference another client chose. It came *from* the backend, so
   * it is recorded as what is stored rather than written back — otherwise two
   * clients would answer each other's announcements forever.
   */
  const adopt = (preference: AppearancePreference): void => {
    stored = preference;
    applyIfDifferent(preference.mode);
  };

  let unsubscribe: (() => void) | undefined;

  const start = async (): Promise<void> => {
    unsubscribe = unsubscribe ?? subscription.subscribe(adopt);
    // A backend this client cannot reach is not an error the operator can do
    // anything about, and not a reason to change what is on screen: the cached
    // scheme goes on applying and the page themes correctly. Swallowing the
    // read is therefore the behaviour, not a shortcut — nothing downstream has
    // a use for the failure.
    stored = (await client.get().catch(() => undefined)) ?? null;
    if (stored === null && cache.readMode() === null) {
      // Nothing stored anywhere: "follow the device" is the documented starting
      // point, and this is the one load that has something to tell the backend.
      await reconcile('system');
      return;
    }
    if (stored === null) {
      // Either the read failed or the installation has no preference yet. Leave
      // this browser painting what it already was; a choice made from here still
      // publishes normally.
      return;
    }
    await reconcile(stored.mode);
  };

  return {
    start,
    choose: (mode: AppearanceMode) => reconcile(mode),
    stop: () => {
      unsubscribe?.();
      unsubscribe = undefined;
    },
  };
};
