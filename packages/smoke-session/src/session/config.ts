import { SessionRole } from './domain';
import { ClockPort, CloudSocketPort, DeviceFeedPort, SessionApiPort } from './ports';

/**
 * Everything the store needs at construction: the explicit role plus the ports
 * it will consume. The device feed is required for (and only valid for) the
 * smoker role.
 */
export interface SessionConfig {
  role: SessionRole;
  socket: CloudSocketPort;
  api: SessionApiPort;
  clock: ClockPort;
  /** Required for the smoker role, forbidden for the monitor role. */
  deviceFeed?: DeviceFeedPort;
}

/** Thrown when a {@link SessionConfig} pairs a role with the wrong ports. */
export class InvalidSessionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSessionConfigError';
    Object.setPrototypeOf(this, InvalidSessionConfigError.prototype);
  }
}

/**
 * Validate a {@link SessionConfig}, throwing {@link InvalidSessionConfigError}
 * on a role/port mismatch. The smoker role consumes the device feed; the
 * monitor role must never be handed one (it has no serial source and applying
 * device readings in a viewer would be a protocol bug).
 */
export function assertValidConfig(config: SessionConfig): void {
  if (config.role === 'monitor' && config.deviceFeed !== undefined) {
    throw new InvalidSessionConfigError(
      'monitor role must not be given a device feed: it consumes the cloud socket only'
    );
  }
  if (config.role === 'smoker' && config.deviceFeed === undefined) {
    throw new InvalidSessionConfigError(
      'smoker role requires a device feed to consume serial readings'
    );
  }
}
