import { useContext, useEffect, useRef, useState } from 'react';
import { SessionSnapshot, SessionStore } from '../session';
import { SmokeSessionContext } from './context';

/** Opt-in behaviors for the 90%-path {@link useSmokeSession} hook. */
export interface UseSmokeSessionOptions {
  /**
   * Save the profile draft when the *consuming component* unmounts, regardless
   * of whether the Provider is also unmounting. Off by default; the web smoke
   * step opts in because its save timing is tied to the component's lifetime
   * (leaving the step persists notes + wood type).
   */
  flushProfileOnUnmount?: boolean;
}

/**
 * The command half of the hook's return: the store's stable command references,
 * pinned by {@link Pick} so a new store command automatically surfaces here and
 * a removed one fails to compile — the binding can never drift from the store.
 */
export type SmokeSessionCommands = Pick<
  SessionStore,
  'toggleSmoking' | 'setName' | 'setNotes' | 'setWoodType' | 'flushProfile' | 'refreshInitialTemps'
>;

/**
 * What a consumer sees: the flattened snapshot (every field at the top level)
 * plus the stable command references. Flattening keeps the 90% call site a
 * single destructure, e.g. `const { chamberTemp, toggleSmoking } = useSmokeSession()`.
 */
export type SmokeSessionValue = SessionSnapshot & SmokeSessionCommands;

/**
 * The 90%-path binding: subscribe to the live session and re-render on every
 * snapshot change. Zero-argument in the common case; pass
 * {@link UseSmokeSessionOptions.flushProfileOnUnmount} only where the profile
 * save is tied to a component's lifetime.
 *
 * Throws when used outside a {@link SmokeSessionProvider} — there is no ambient
 * store, so a missing Provider is a wiring bug, not a silently degraded render.
 */
export function useSmokeSession(options: UseSmokeSessionOptions = {}): SmokeSessionValue {
  const store = useContext(SmokeSessionContext);
  if (store === null) {
    throw new Error(
      'useSmokeSession must be used within a <SmokeSessionProvider>. ' +
        'Wrap your app (or the smoke screen) in a provider constructed at the composition root.'
    );
  }

  // The store hands out a fresh immutable snapshot on every change, so a plain
  // re-read on each notification is a correct, tearing-free subscription; the
  // effect re-reads once on attach to close the mount→subscribe gap. The store
  // remains useSyncExternalStore-compatible for hosts that prefer that hook.
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => store.getSnapshot());
  useEffect(() => {
    setSnapshot(store.getSnapshot());
    return store.subscribe(() => setSnapshot(store.getSnapshot()));
  }, [store]);

  // Read the latest option through a ref so toggling it never re-runs (and thus
  // never re-arms) the unmount flush; the cleanup fires exactly once, on unmount.
  const flushOnUnmount = options.flushProfileOnUnmount ?? false;
  const flushOnUnmountRef = useRef(flushOnUnmount);
  flushOnUnmountRef.current = flushOnUnmount;
  useEffect(
    () => () => {
      if (flushOnUnmountRef.current) {
        // Fire-and-forget on unmount: swallow a rejected save (e.g. no active
        // smoke → backend 404) so leaving the step never raises an unhandled
        // promise rejection. This matches the legacy save-on-leave, which
        // caught and logged the same failure rather than surfacing it.
        void store.flushProfile().catch(() => undefined);
      }
    },
    [store]
  );

  return {
    ...snapshot,
    toggleSmoking: store.toggleSmoking,
    setName: store.setName,
    setNotes: store.setNotes,
    setWoodType: store.setWoodType,
    flushProfile: store.flushProfile,
    refreshInitialTemps: store.refreshInitialTemps,
  };
}
