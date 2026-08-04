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
  /**
   * Call this back whenever the operating system changes its own preference,
   * and hand back the way to stop listening.
   *
   * "Follow the device" is a standing instruction rather than a value, and the
   * device can change its mind while the page is open. Only a browser can see
   * that happen, so a browser that noticed and said nothing would leave the
   * touchscreen — which renders the recorded answer — painted for this morning.
   */
  watchSystemDark(listener: () => void): () => void;
}

/**
 * Reading and writing the installation's stored preference.
 *
 * The read always answers with a preference: an installation nobody has chosen
 * an appearance on holds the documented default rather than nothing at all, so
 * "no preference" is not a state a caller has to have an opinion about. A read
 * that could not be made rejects, which is a different thing entirely.
 */
export interface AppearanceClientPort {
  get(): Promise<AppearancePreference>;
  save(preference: AppearancePreference): Promise<AppearancePreference>;
}

/**
 * How this client hears that another one changed the preference. Carried in
 * production by the appearance event on the application's websocket; the seam is
 * here so the store's response to a change is testable without a socket.
 */
export interface AppearanceSubscriptionPort {
  /** Register a listener, and hand back the way to stop listening. */
  subscribe(listener: (preference: AppearancePreference) => void): () => void;
}

/** A channel that never delivers anything, for a client assembled without one. */
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
   * How many times something newer than a load has settled the appearance: an
   * operator choosing an option, or another client announcing one.
   *
   * A load takes as long as the backend takes, and the operator in front of the
   * settings page has no idea it is happening. Anything they do meanwhile is the
   * later word on what the installation should look like, so a read that was
   * already on its way when it happened is stale by the time it lands — applying
   * it would repaint away from the choice they just made and leave the screen
   * disagreeing with the backend until the next reload.
   */
  let settlements = 0;

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
    settlements += 1;
    stored = preference;
    applyIfDifferent(preference.mode);
  };

  /**
   * The machine changed its own preference. Nothing was chosen — the mode still
   * says whatever it said — so this reconciles that same mode again, which is a
   * no-op for a fixed scheme and a new resolved value under "follow the device".
   *
   * Silent until the installation's value has arrived. Before that this browser
   * knows only what it is painting, and recording that would publish a guess:
   * a browser opened on its cached "follow the device" would overwrite the fixed
   * scheme an operator chose elsewhere. Nothing is lost by waiting — the load
   * resolves the mode it fetches against the machine as it is when it lands, so
   * the change is recorded then.
   *
   * Deliberately not counted as a settlement, for the same reason: an answer
   * still on its way carries the mode the installation actually holds, which
   * this has no way of knowing and no business discarding.
   */
  const reactToSystem = (): void => {
    if (stored === null) {
      return;
    }
    void reconcile(stored.mode);
  };

  let unsubscribe: (() => void) | undefined;
  let unwatch: (() => void) | undefined;

  const start = async (): Promise<void> => {
    unsubscribe = unsubscribe ?? subscription.subscribe(adopt);
    unwatch = unwatch ?? cache.watchSystemDark(reactToSystem);
    const began = settlements;
    // A backend this client cannot reach is not an error the operator can do
    // anything about, and not a reason to change what is on screen: the cached
    // scheme goes on applying and the page themes correctly. Swallowing the
    // read is therefore the behaviour, not a shortcut — nothing downstream has
    // a use for the failure.
    const fetched = await client.get().catch(() => null);
    if (fetched === null || settlements !== began) {
      // The read failed, or something newer settled the appearance while it was
      // in flight. Either way this answer has nothing left to say: the scheme on
      // screen stands, and a choice made from here still publishes normally.
      return;
    }
    stored = fetched;
    await reconcile(fetched.mode);
  };

  return {
    start,
    choose: (mode: AppearanceMode) => {
      settlements += 1;
      return reconcile(mode);
    },
    stop: () => {
      unsubscribe?.();
      unsubscribe = undefined;
      unwatch?.();
      unwatch = undefined;
    },
  };
};
