import { buildSmokeUpdate, decodeEvents } from '../wire/codecs';
import { SmokeUpdate } from '../wire/types';
import { assertValidConfig, SessionConfig } from './config';
import { DEFAULT_PROBE_NAMES, NameTarget, SessionError, SmokeProfile } from './domain';
import { Unsubscribe } from './ports';
import { createInitialSnapshot, SessionSnapshot } from './snapshot';

/**
 * The framework-agnostic live-session store. Owns the whole monitor-side
 * session lifecycle — startup loads, inbound frame handling, profile draft +
 * flush, and the command surface — behind an immutable snapshot + subscribe
 * contract compatible with React's `useSyncExternalStore`.
 */
export interface SessionStore {
  /** The current immutable snapshot (stable reference between changes). */
  getSnapshot(): SessionSnapshot;
  /** Register a change listener; the returned handle detaches it. */
  subscribe(listener: () => void): Unsubscribe;
  /** Attach port subscriptions and kick off concurrent startup loads. Idempotent. */
  start(): void;
  /** Detach every port subscription; no inbound callback mutates state after. */
  stop(): void;
  /** Flip persisted smoking and broadcast the full five-field update. */
  toggleSmoking(): Promise<void>;
  /** Edit one name in the draft and broadcast the full five-field update. */
  setName(target: NameTarget, value: string): void;
  /** Edit the draft notes (local only until flushed). */
  setNotes(value: string): void;
  /** Edit the draft wood type (local only until flushed). */
  setWoodType(value: string): void;
  /** Persist the draft (names + notes + wood type) as of call time. */
  flushProfile(): Promise<void>;
  /** Re-fetch the chart baseline history. */
  refreshInitialTemps(): Promise<void>;
}

/**
 * Construct a session store for the given role and ports. Throws on a
 * role/port mismatch (see {@link assertValidConfig}). Call {@link
 * SessionStore.start} once the host has mounted.
 */
export function createSessionStore(config: SessionConfig): SessionStore {
  assertValidConfig(config);
  const { socket, api, clock } = config;

  let snapshot = createInitialSnapshot(clock.now());
  const listeners = new Set<() => void>();
  const portSubscriptions: Unsubscribe[] = [];
  let started = false;

  const getSnapshot = (): SessionSnapshot => snapshot;

  const subscribe = (listener: () => void): Unsubscribe => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const commit = (patch: Partial<SessionSnapshot>): void => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) {
      listener();
    }
  };

  const currentSmokeUpdate = (smoking: boolean): SmokeUpdate =>
    buildSmokeUpdate({
      smoking,
      chamberName: snapshot.chamberName,
      probe1Name: snapshot.probe1Name,
      probe2Name: snapshot.probe2Name,
      probe3Name: snapshot.probe3Name,
    });

  const applyProfile = (profile: SmokeProfile): void => {
    commit({
      chamberName: profile.chamberName,
      probe1Name: profile.probe1Name,
      probe2Name: profile.probe2Name,
      probe3Name: profile.probe3Name,
      notes: profile.notes,
      woodType: profile.woodType,
    });
  };

  const errorMessage = (cause: unknown): string =>
    cause instanceof Error ? cause.message : String(cause);

  const surface = (error: SessionError): void => commit({ lastError: error });

  // --- startup loads (concurrent, individually fault-tolerant) ---

  const loadProfile = async (): Promise<void> => {
    try {
      const profile = await api.getProfile();
      // A null profile is a normal "no smoke yet" state: keep the defaults the
      // snapshot already holds, and it is explicitly not an error.
      if (profile !== null) {
        applyProfile(profile);
      }
    } catch (cause) {
      surface({ source: 'profile', message: errorMessage(cause) });
    }
  };

  const loadState = async (): Promise<void> => {
    try {
      const state = await api.getSmokingState();
      commit({ smoking: state.smoking });
    } catch (cause) {
      surface({ source: 'state', message: errorMessage(cause) });
    }
  };

  const loadTemps = async (): Promise<void> => {
    try {
      const temps = await api.getCurrentTemps();
      commit({ initialTemps: temps });
    } catch (cause) {
      surface({ source: 'temps', message: errorMessage(cause) });
    }
  };

  // --- inbound frame handlers (monitor role) ---

  const handleEvents = (payload: string): void => {
    if (!started) return;
    const frame = decodeEvents(payload);
    commit({
      chamberTemp: frame.chamberTemp,
      probeTemp1: frame.probeTemp1,
      probeTemp2: frame.probeTemp2,
      probeTemp3: frame.probeTemp3,
      date: new Date(frame.date),
    });
  };

  const handleSmokeUpdate = (update: SmokeUpdate): void => {
    if (!started) return;
    // Monitor role applies smoking ONLY. Inbound names never clobber a probe
    // name the local user may be editing.
    commit({ smoking: update.smoking });
  };

  const handleClear = async (): Promise<void> => {
    if (!started) return;
    try {
      const profile = await api.getProfile();
      if (profile !== null) {
        applyProfile(profile);
      } else {
        commit({ ...DEFAULT_PROBE_NAMES });
      }
      commit({ initialTemps: [] });
    } catch {
      // A failed reload falls back to sensible defaults and a stopped smoke, so
      // the screen never shows stale or broken labels after a clear.
      commit({ ...DEFAULT_PROBE_NAMES, smoking: false, initialTemps: [] });
    }
  };

  const handleRefresh = async (): Promise<void> => {
    if (!started) return;
    await refreshInitialTemps();
  };

  const handleConnectionChange = (connected: boolean): void => {
    if (!started) return;
    commit({ connected });
  };

  // --- command surface ---

  const toggleSmoking = async (): Promise<void> => {
    const state = await api.toggleSmoking();
    socket.emitSmokeUpdate(currentSmokeUpdate(state.smoking));
    commit({ smoking: state.smoking });
  };

  const setName = (target: NameTarget, value: string): void => {
    const field =
      target === 'chamber'
        ? 'chamberName'
        : target === 'probe1'
          ? 'probe1Name'
          : target === 'probe2'
            ? 'probe2Name'
            : 'probe3Name';
    commit({ [field]: value } as Partial<SessionSnapshot>);
    socket.emitSmokeUpdate(currentSmokeUpdate(snapshot.smoking));
  };

  const setNotes = (value: string): void => commit({ notes: value });

  const setWoodType = (value: string): void => commit({ woodType: value });

  const flushProfile = async (): Promise<void> => {
    await api.saveProfile({
      chamberName: snapshot.chamberName,
      probe1Name: snapshot.probe1Name,
      probe2Name: snapshot.probe2Name,
      probe3Name: snapshot.probe3Name,
      notes: snapshot.notes,
      woodType: snapshot.woodType,
    });
  };

  async function refreshInitialTemps(): Promise<void> {
    const temps = await api.getCurrentTemps();
    commit({ initialTemps: temps });
  }

  const start = (): void => {
    if (started) return;
    started = true;
    portSubscriptions.push(
      socket.onEvents(handleEvents),
      socket.onSmokeUpdate(handleSmokeUpdate),
      socket.onClear(() => void handleClear()),
      socket.onRefresh(() => void handleRefresh()),
      socket.onConnectionChange(handleConnectionChange)
    );
    void loadProfile();
    void loadState();
    void loadTemps();
  };

  const stop = (): void => {
    started = false;
    while (portSubscriptions.length > 0) {
      const unsubscribe = portSubscriptions.pop();
      if (unsubscribe) unsubscribe();
    }
  };

  return {
    getSnapshot,
    subscribe,
    start,
    stop,
    toggleSmoking,
    setName,
    setNotes,
    setWoodType,
    flushProfile,
    refreshInitialTemps,
  };
}
