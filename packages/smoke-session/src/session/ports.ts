import { BatchTempDto, SmokeUpdate } from '../wire/types';
import { SmokeProfile, SmokingState } from './domain';

/**
 * Ports & adapters boundary for the session store. Every remote-but-owned
 * dependency the store consumes is expressed here as a narrow interface, so the
 * store can be driven end-to-end by the in-memory fakes in `../testing` with no
 * sockets, HTTP, or timers.
 */

/** Handle returned by every subscription; calling it detaches the listener. */
export type Unsubscribe = () => void;

/**
 * The cloud websocket, as the session sees it: typed inbound frames, a
 * connection-change signal, and typed outbound emits. The socket library import
 * is confined to the production adapter that satisfies this port — never the
 * store.
 */
export interface CloudSocketPort {
  /** The live `events` frame, delivered as the raw JSON *string* off the wire. */
  onEvents(listener: (payload: string) => void): Unsubscribe;
  /** The `smokeUpdate` object frame (never a JSON string). */
  onSmokeUpdate(listener: (update: SmokeUpdate) => void): Unsubscribe;
  /** The `clear` signal: the current smoke was reset; reload from scratch. */
  onClear(listener: () => void): Unsubscribe;
  /** The `refresh` signal: re-fetch chart history. */
  onRefresh(listener: () => void): Unsubscribe;
  /** Connectivity transitions (true = connected). */
  onConnectionChange(listener: (connected: boolean) => void): Unsubscribe;
  /** Broadcast the full five-field smoke update. */
  emitSmokeUpdate(update: SmokeUpdate): void;
  /** Broadcast a clear signal. */
  emitClear(): void;
  /** Broadcast the frozen `events` payload as the raw JSON *string*. */
  emitEvents(payload: string): void;
  /** Broadcast a `refresh` signal (tell viewers to re-fetch chart history). */
  emitRefresh(): void;
}

/**
 * The narrow six-method HTTP surface the session needs. Each method resolves a
 * defined value or rejects — it never resolves `undefined`. "No profile saved
 * yet" is represented explicitly as `null`, not as a rejection or a blank
 * object.
 */
export interface SessionApiPort {
  /** Current smoke profile, or `null` when none has been saved yet. */
  getProfile(): Promise<SmokeProfile | null>;
  /** Persist the current profile draft. */
  saveProfile(profile: SmokeProfile): Promise<void>;
  /** Current persisted smoking flag. */
  getSmokingState(): Promise<SmokingState>;
  /** Flip the persisted smoking flag and return the new state. */
  toggleSmoking(): Promise<SmokingState>;
  /** The chart history for the current smoke (baseline temps). */
  getCurrentTemps(): Promise<BatchTempDto[]>;
  /** Persist a batch of buffered readings (used by the smoker role). */
  postTempsBatch(batch: BatchTempDto[]): Promise<void>;
}

/**
 * The sole source of time for the session. All timestamps in emitted frames and
 * persisted batches read through this, making outputs reproducible in tests.
 */
export interface ClockPort {
  now(): Date;
}

/**
 * The device serial feed, consumed only by the smoker role. Present here so the
 * config validator can reject role/port mismatches; the monitor role must never
 * receive one.
 */
export interface DeviceFeedPort {
  /** A raw serial reading frame. */
  onReading(listener: (raw: string) => void): Unsubscribe;
  /** Device connectivity transitions. */
  onConnectionChange(listener: (connected: boolean) => void): Unsubscribe;
}

/**
 * The device's wifi connectivity, as a single point query. Consumed only by the
 * smoker role and only when wifi probing is enabled in config. The store calls
 * it behind a throttle so the indicator stays accurate without one HTTP round
 * trip per serial reading.
 */
export interface WifiStatusPort {
  /** Resolve `true` when the device currently has a wifi connection. */
  getStatus(): Promise<boolean>;
}
