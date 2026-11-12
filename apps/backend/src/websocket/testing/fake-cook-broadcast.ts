import type { CookEvent } from '../../cookEvents/cook-events.schema';
import {
  COOK_BROADCAST,
  CookBroadcastPort,
  SmokeUpdateFrame,
} from '../cook-broadcast';

/**
 * The broadcast port as a test gives it: recording, so a spec can hold a
 * transition to announcing itself exactly once, and to announcing what the apps
 * actually apply.
 *
 * The second implementation behind {@link CookBroadcastPort} — the reason the
 * port exists. Without it a spec of the Active Cook would have to stand a
 * socket server up behind the transition it is testing.
 *
 * Test-only — excluded from coverage collection.
 */
export interface FakeCookBroadcast extends CookBroadcastPort {
  broadcastCookEvents: jest.Mock<void, [CookEvent[]]>;
  broadcastSmokeUpdate: jest.Mock<void, [SmokeUpdateFrame]>;
}

/** A recording port, over a socket every client is taken to be listening on. */
export const fakeCookBroadcast = (): FakeCookBroadcast => ({
  broadcastCookEvents: jest.fn(),
  broadcastSmokeUpdate: jest.fn(),
});

/** The port as the provider a spec registers it under. */
export const cookBroadcastProvider = (
  port: CookBroadcastPort = fakeCookBroadcast(),
) => ({ provide: COOK_BROADCAST, useValue: port });
