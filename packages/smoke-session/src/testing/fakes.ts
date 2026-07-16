import { BatchTempDto, SmokeUpdate } from '../wire/types';
import { SmokeProfile, SmokingState } from '../session/domain';
import {
  ClockPort,
  CloudSocketPort,
  DeviceFeedPort,
  SessionApiPort,
  Unsubscribe,
} from '../session/ports';

/**
 * In-memory fakes shipped with the package so both host apps (and future e2e
 * harnesses) exercise identical protocol semantics with zero sockets, HTTP, or
 * timers. Every fake records what it was asked to do so tests assert observable
 * boundary behavior, not internal store state.
 */

/** Removes `listener` from `set` and returns the standard unsubscribe handle. */
function subscription<T>(set: Set<T>, listener: T): Unsubscribe {
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

/**
 * A settable, injectable, recording stand-in for the cloud websocket. Tests push
 * inbound frames with the `inject*` methods, flip `connected` with
 * {@link setConnected}, and assert against the `emitted*` recorders.
 */
export class FakeCloudSocket implements CloudSocketPort {
  private readonly eventsListeners = new Set<(payload: string) => void>();
  private readonly smokeUpdateListeners = new Set<(update: SmokeUpdate) => void>();
  private readonly clearListeners = new Set<() => void>();
  private readonly refreshListeners = new Set<() => void>();
  private readonly connectionListeners = new Set<(connected: boolean) => void>();

  /** Every smoke update the store broadcast, in order. */
  readonly emittedSmokeUpdates: SmokeUpdate[] = [];
  /** How many clear signals the store broadcast. */
  emittedClears = 0;

  onEvents(listener: (payload: string) => void): Unsubscribe {
    return subscription(this.eventsListeners, listener);
  }

  onSmokeUpdate(listener: (update: SmokeUpdate) => void): Unsubscribe {
    return subscription(this.smokeUpdateListeners, listener);
  }

  onClear(listener: () => void): Unsubscribe {
    return subscription(this.clearListeners, listener);
  }

  onRefresh(listener: () => void): Unsubscribe {
    return subscription(this.refreshListeners, listener);
  }

  onConnectionChange(listener: (connected: boolean) => void): Unsubscribe {
    return subscription(this.connectionListeners, listener);
  }

  emitSmokeUpdate(update: SmokeUpdate): void {
    this.emittedSmokeUpdates.push(update);
  }

  emitClear(): void {
    this.emittedClears += 1;
  }

  /** Deliver an inbound `events` JSON-string frame to subscribers. */
  injectEvents(payload: string): void {
    for (const listener of this.eventsListeners) listener(payload);
  }

  /** Deliver an inbound `smokeUpdate` object frame to subscribers. */
  injectSmokeUpdate(update: SmokeUpdate): void {
    for (const listener of this.smokeUpdateListeners) listener(update);
  }

  /** Deliver an inbound `clear` signal to subscribers. */
  injectClear(): void {
    for (const listener of this.clearListeners) listener();
  }

  /** Deliver an inbound `refresh` signal to subscribers. */
  injectRefresh(): void {
    for (const listener of this.refreshListeners) listener();
  }

  /** Report a connectivity transition to subscribers. */
  setConnected(connected: boolean): void {
    for (const listener of this.connectionListeners) listener(connected);
  }
}

/** A single recorded call against {@link FakeSessionApi}. */
export interface ApiCall {
  method: keyof SessionApiPort;
  args: readonly unknown[];
}

/**
 * A seedable, fault-injecting stand-in for the HTTP surface. Seed the profile,
 * smoking state, and temps; force the next call to a method to reject with
 * {@link failNext}; inspect the ordered {@link calls} log.
 */
export class FakeSessionApi implements SessionApiPort {
  /** Ordered log of every method invoked and its arguments. */
  readonly calls: ApiCall[] = [];

  private profile: SmokeProfile | null = null;
  private smoking = false;
  private temps: BatchTempDto[] = [];
  private readonly failing = new Set<keyof SessionApiPort>();

  /** Seed the profile returned by {@link getProfile} (`null` = none saved). */
  seedProfile(profile: SmokeProfile | null): this {
    this.profile = profile;
    return this;
  }

  /** Seed the persisted smoking flag. */
  seedSmoking(smoking: boolean): this {
    this.smoking = smoking;
    return this;
  }

  /** Seed the chart baseline returned by {@link getCurrentTemps}. */
  seedTemps(temps: BatchTempDto[]): this {
    this.temps = temps;
    return this;
  }

  /** Make the next invocation of `method` reject once, then behave normally. */
  failNext(method: keyof SessionApiPort): this {
    this.failing.add(method);
    return this;
  }

  private guard(method: keyof SessionApiPort): void {
    if (this.failing.has(method)) {
      this.failing.delete(method);
      throw new Error(`FakeSessionApi: forced failure of ${method}`);
    }
  }

  async getProfile(): Promise<SmokeProfile | null> {
    this.calls.push({ method: 'getProfile', args: [] });
    this.guard('getProfile');
    return this.profile;
  }

  async saveProfile(profile: SmokeProfile): Promise<void> {
    this.calls.push({ method: 'saveProfile', args: [profile] });
    this.guard('saveProfile');
    this.profile = profile;
  }

  async getSmokingState(): Promise<SmokingState> {
    this.calls.push({ method: 'getSmokingState', args: [] });
    this.guard('getSmokingState');
    return { smoking: this.smoking };
  }

  async toggleSmoking(): Promise<SmokingState> {
    this.calls.push({ method: 'toggleSmoking', args: [] });
    this.guard('toggleSmoking');
    this.smoking = !this.smoking;
    return { smoking: this.smoking };
  }

  async getCurrentTemps(): Promise<BatchTempDto[]> {
    this.calls.push({ method: 'getCurrentTemps', args: [] });
    this.guard('getCurrentTemps');
    return this.temps;
  }

  async postTempsBatch(batch: BatchTempDto[]): Promise<void> {
    this.calls.push({ method: 'postTempsBatch', args: [batch] });
    this.guard('postTempsBatch');
  }

  /** Count how many times `method` was invoked. */
  countCalls(method: keyof SessionApiPort): number {
    return this.calls.filter(call => call.method === method).length;
  }
}

/**
 * A deterministic clock whose {@link now} only moves when a test steps it. The
 * sole source of time in tests, so emitted frames and batches are reproducible.
 */
export class SteppingClock implements ClockPort {
  private current: Date;

  constructor(start: Date = new Date('2026-07-14T12:00:00.000Z')) {
    this.current = start;
  }

  now(): Date {
    return this.current;
  }

  /** Advance the clock by `ms` milliseconds. */
  step(ms: number): this {
    this.current = new Date(this.current.getTime() + ms);
    return this;
  }

  /** Set the clock to an exact instant. */
  set(date: Date): this {
    this.current = date;
    return this;
  }
}

/**
 * A recording stand-in for the device serial feed, used to construct valid
 * smoker-role stores (and to assert the monitor role rejects one).
 */
export class FakeDeviceFeed implements DeviceFeedPort {
  private readonly readingListeners = new Set<(raw: string) => void>();
  private readonly connectionListeners = new Set<(connected: boolean) => void>();

  onReading(listener: (raw: string) => void): Unsubscribe {
    return subscription(this.readingListeners, listener);
  }

  onConnectionChange(listener: (connected: boolean) => void): Unsubscribe {
    return subscription(this.connectionListeners, listener);
  }

  /** Deliver an inbound raw serial frame to subscribers. */
  injectReading(raw: string): void {
    for (const listener of this.readingListeners) listener(raw);
  }

  /** Report a device connectivity transition. */
  setConnected(connected: boolean): void {
    for (const listener of this.connectionListeners) listener(connected);
  }
}

/**
 * Resolve after the microtask queue drains, letting the store's fire-and-forget
 * startup loads (which resolve immediately through the fakes) settle before a
 * test asserts. One await is enough since the fakes never schedule real timers.
 */
export function flushPromises(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}
