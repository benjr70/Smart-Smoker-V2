import { SessionRole } from '../session/domain';
import { createSessionStore, SessionStore } from '../session/store';
import {
  FakeCloudSocket,
  FakeDeviceFeed,
  FakeSessionApi,
  flushPromises,
  SteppingClock,
} from './fakes';

/** The wired kit a {@link createTestHarness} call returns. */
export interface TestHarness {
  store: SessionStore;
  socket: FakeCloudSocket;
  api: FakeSessionApi;
  clock: SteppingClock;
  deviceFeed?: FakeDeviceFeed;
  /** Await the store's in-flight startup/command promises. */
  flush(): Promise<void>;
}

/** Options for {@link createTestHarness}. */
export interface HarnessOptions {
  /** Defaults to `monitor`. A `smoker` harness gets a fake device feed. */
  role?: SessionRole;
}

/**
 * One-call factory: build the fakes, the stepping clock, and a wired store for
 * the requested role. The whole monitor-side lifecycle is then exercisable
 * through the returned kit with no sockets, HTTP, or timers.
 */
export function createTestHarness(options: HarnessOptions = {}): TestHarness {
  const role = options.role ?? 'monitor';
  const socket = new FakeCloudSocket();
  const api = new FakeSessionApi();
  const clock = new SteppingClock();
  const deviceFeed = role === 'smoker' ? new FakeDeviceFeed() : undefined;

  const store = createSessionStore({ role, socket, api, clock, deviceFeed });

  return {
    store,
    socket,
    api,
    clock,
    deviceFeed,
    flush: flushPromises,
  };
}
