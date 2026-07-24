import {
  buildSmokeUpdate,
  decodeEvents,
  decodeSerialReading,
  encodeEvents,
  toBatchDto,
} from '../wire/codecs';
import { ProbeReading, SmokeUpdate } from '../wire/types';
import { assertValidConfig, DEFAULT_BATCH_EVERY, SessionConfig } from './config';
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
  const batchEvery = config.batchEvery ?? DEFAULT_BATCH_EVERY;

  let snapshot = createInitialSnapshot(clock.now());
  const listeners = new Set<() => void>();
  const portSubscriptions: Unsubscribe[] = [];
  let started = false;
  // True once the startup profile load has resolved (whether it found a saved
  // profile or a null "no smoke yet"). Guards flushProfile from persisting the
  // placeholder defaults over a real saved profile when the host leaves before
  // the load completes.
  let profileLoaded = false;

  // --- smoker-role offline batching state ---
  // Buffered offline readings awaiting the next reconnect flush. Each entry is
  // an immutable copy captured at reading time, so later renames or newer
  // readings never mutate an already-buffered sample.
  let pendingBatch: ProbeReading[] = [];
  // Counts disconnected readings toward the every-Nth keep gate.
  let disconnectedCount = 0;
  // Re-entrancy guard: true while a batch POST is in flight so a reading that
  // arrives mid-flush cannot kick off a second concurrent upload.
  let flushInFlight = false;
  // Epoch millis of the last wifi probe, or null before the first probe.
  let lastWifiProbeAt: number | null = null;

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
      // The draft is now hydrated (real profile applied, or defaults confirmed
      // as the genuine state): flushing it can no longer clobber saved data.
      profileLoaded = true;
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

  // --- smoker role: device feed + offline batching ---

  /** Encode the current snapshot into a frozen `events` payload string. */
  const currentEventsPayload = (): string =>
    encodeEvents({
      chamberName: snapshot.chamberName,
      probe1Name: snapshot.probe1Name,
      probe2Name: snapshot.probe2Name,
      probe3Name: snapshot.probe3Name,
      probeTemp1: snapshot.probeTemp1,
      probeTemp2: snapshot.probeTemp2,
      probeTemp3: snapshot.probeTemp3,
      chamberTemp: snapshot.chamberTemp,
      smoking: snapshot.smoking,
      date: snapshot.date,
    });

  /**
   * Flush the buffered batch on reconnect. Fix 1: `refresh` is emitted only
   * after the POST resolves (no race). Fix 2: a failed POST retains the batch
   * for the next reconnect window and emits no `refresh` (no silent loss).
   * Re-entrancy guarded so a mid-flush reading cannot double-POST.
   */
  const flushPendingBatch = async (): Promise<void> => {
    if (flushInFlight || pendingBatch.length === 0) return;
    flushInFlight = true;
    const sending = pendingBatch;
    try {
      await api.postTempsBatch(sending.map(toBatchDto));
    } catch {
      // Retain the batch (still in pendingBatch) and emit no refresh.
      return;
    } finally {
      flushInFlight = false;
    }
    // Drop exactly the readings we uploaded; any that arrived mid-flush stay.
    pendingBatch = pendingBatch.slice(sending.length);
    commit({ pendingBatchSize: pendingBatch.length });
    socket.emitRefresh();
  };

  /** Buffer a disconnected reading on the frozen every-Nth cadence. */
  const bufferReading = (reading: ProbeReading): void => {
    disconnectedCount += 1;
    if (disconnectedCount >= batchEvery) {
      pendingBatch = [...pendingBatch, reading];
      disconnectedCount = 0;
      commit({ pendingBatchSize: pendingBatch.length });
    }
  };

  /** Query wifi status at most once per throttle window; never throws. */
  const probeWifi = async (now: Date): Promise<void> => {
    const wifi = config.wifi;
    if (wifi === undefined) return;
    if (lastWifiProbeAt !== null && now.getTime() - lastWifiProbeAt < wifi.throttleMs) {
      return;
    }
    lastWifiProbeAt = now.getTime();
    try {
      const wifiConnected = await wifi.port.getStatus();
      commit({ wifiConnected });
    } catch {
      // A wifi probe failure must never kill the session; leave the last value.
    }
  };

  const handleDeviceReading = (raw: string): void => {
    if (!started) return;
    let reading: ProbeReading;
    try {
      reading = decodeSerialReading(raw, clock.now());
    } catch (cause) {
      // Malformed frames surface as an error and are dropped; the snapshot temps
      // are left untouched and the next reading still processes.
      surface({ source: 'device', message: errorMessage(cause) });
      return;
    }
    // Freeze the captured reading so a later rename/reading cannot mutate a
    // buffered sample.
    const captured: ProbeReading = { ...reading };
    commit({
      probeTemp1: captured.probeTemp1,
      probeTemp2: captured.probeTemp2,
      probeTemp3: captured.probeTemp3,
      chamberTemp: captured.chamberTemp,
      date: captured.date,
    });
    void probeWifi(captured.date);
    if (snapshot.connected) {
      // Capture the payload for THIS reading before awaiting the flush so the
      // outbound order is deterministically [refresh?, events].
      const payload = currentEventsPayload();
      void flushPendingBatch().then(() => socket.emitEvents(payload));
    } else {
      bufferReading(captured);
    }
  };

  const handleSmokeUpdateSmoker = (update: SmokeUpdate): void => {
    if (!started) return;
    // Smoker role applies BOTH smoking and the names (unlike the monitor role,
    // which never lets inbound names clobber an in-progress local edit).
    commit({
      smoking: update.smoking,
      chamberName: update.chamberName,
      probe1Name: update.probe1Name,
      probe2Name: update.probe2Name,
      probe3Name: update.probe3Name,
    });
  };

  // --- command surface ---

  const toggleSmoking = async (): Promise<void> => {
    try {
      const state = await api.toggleSmoking();
      socket.emitSmokeUpdate(currentSmokeUpdate(state.smoking));
      commit({ smoking: state.smoking });
    } catch (cause) {
      // A failed toggle surfaces in lastError like the startup loads rather
      // than rejecting into a fire-and-forget caller (the button's onClick),
      // which would otherwise produce an unhandled rejection and no feedback.
      surface({ source: 'state', message: errorMessage(cause) });
    }
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
    // Never persist a draft we never hydrated. If the startup profile load has
    // not resolved (slow network, quick leave), the draft still holds the
    // placeholder defaults, and saving them would overwrite the user's real
    // saved profile. Skip until the baseline is known.
    if (!profileLoaded) return;
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
    if (config.role === 'smoker') {
      // The smoker produces the feed: it consumes device readings, applies
      // inbound smokeUpdate names + smoking, resets its labels + chart baseline
      // on a cloud clear (relaying a finished/cleared session), and tracks cloud
      // connectivity.
      const deviceFeed = config.deviceFeed!;
      portSubscriptions.push(
        deviceFeed.onReading(handleDeviceReading),
        socket.onSmokeUpdate(handleSmokeUpdateSmoker),
        socket.onClear(() => void handleClear()),
        socket.onConnectionChange(handleConnectionChange)
      );
    } else {
      portSubscriptions.push(
        socket.onEvents(handleEvents),
        socket.onSmokeUpdate(handleSmokeUpdate),
        socket.onClear(() => void handleClear()),
        socket.onRefresh(() => void handleRefresh()),
        socket.onConnectionChange(handleConnectionChange)
      );
    }
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
