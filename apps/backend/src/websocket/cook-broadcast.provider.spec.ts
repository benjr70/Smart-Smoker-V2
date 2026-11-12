import { ModuleRef } from '@nestjs/core';
import { CookBroadcast } from './cook-broadcast.provider';
import { EventsGateway } from './events.gateway';

/**
 * The real implementation behind the broadcast port.
 *
 * What is worth holding here is the *lateness* of the lookup. The gateway
 * resolves the Active Cook to relay a reading, and the Active Cook's stop
 * announces itself back over the gateway: resolved while this provider is
 * built, that is a loop Nest cannot construct and the whole application fails
 * to start. Resolved when a transition actually announces, there is no
 * construction edge at all.
 */
describe('the real broadcast port', () => {
  let gateway: {
    broadcastCookEvents: jest.Mock;
    broadcastSmokeUpdate: jest.Mock;
  };
  let moduleRef: { get: jest.Mock };

  beforeEach(() => {
    gateway = {
      broadcastCookEvents: jest.fn(),
      broadcastSmokeUpdate: jest.fn(),
    };
    moduleRef = { get: jest.fn(() => gateway) };
  });

  const port = () => new CookBroadcast(moduleRef as unknown as ModuleRef);

  it('announces an emptied cook log over the gateway', () => {
    port().broadcastCookEvents([]);

    expect(moduleRef.get).toHaveBeenCalledWith(EventsGateway, {
      strict: false,
    });
    expect(gateway.broadcastCookEvents).toHaveBeenCalledWith([]);
  });

  it('announces the backend’s own smoking flip over the gateway', () => {
    const frame = {
      smoking: false,
      chamberName: 'Pit',
      probe1Name: 'Brisket',
      probe2Name: 'Ribs',
      probe3Name: 'Spare',
    };

    port().broadcastSmokeUpdate(frame);

    expect(gateway.broadcastSmokeUpdate).toHaveBeenCalledWith(frame);
  });

  it('looks the gateway up when a transition asks, not when it is built', () => {
    port();

    expect(moduleRef.get).not.toHaveBeenCalled();
  });

  /**
   * The Active Cook logs a failed announcement and keeps the transition it
   * already committed, so what arrives there has to be a throw it can catch
   * rather than a swallowed one.
   */
  it('passes a failed announcement on to its caller', () => {
    gateway.broadcastCookEvents.mockImplementation(() => {
      throw new Error('no socket server yet');
    });

    expect(() => port().broadcastCookEvents([])).toThrow(
      'no socket server yet',
    );
  });
});
