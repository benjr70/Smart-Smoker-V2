import { ModuleRef } from '@nestjs/core';
import { StatsRecompute } from './stats-recompute.provider';
import { StatsService } from './stats.service';

/**
 * The real implementation behind the stats-recompute port.
 *
 * What is worth holding here is the *lateness* of the lookup. The statistics
 * reach the Active Cook through the timeline, and the Active Cook's finish
 * reaches back here: resolved while this provider is built, that is a loop Nest
 * cannot construct and the whole application fails to start. Resolved when a
 * finish actually runs, there is no construction edge at all.
 */
describe('the real stats-recompute port', () => {
  let recalculate: jest.Mock;
  let moduleRef: { get: jest.Mock };

  beforeEach(() => {
    recalculate = jest.fn().mockResolvedValue(undefined);
    moduleRef = { get: jest.fn(() => ({ recalculate })) };
  });

  const port = () => new StatsRecompute(moduleRef as unknown as ModuleRef);

  it('recomputes the archive through the statistics', async () => {
    await port().recompute();

    expect(moduleRef.get).toHaveBeenCalledWith(StatsService, {
      strict: false,
    });
    expect(recalculate).toHaveBeenCalledTimes(1);
  });

  it('looks the statistics up when a finish asks, not when it is built', () => {
    port();

    expect(moduleRef.get).not.toHaveBeenCalled();
  });

  /**
   * The Active Cook logs a failed recompute and finishes the cook anyway, so
   * what arrives there has to be a rejection it can catch rather than a
   * swallowed one.
   */
  it('passes a failed recompute on to its caller', async () => {
    recalculate.mockRejectedValue(new Error('mongo is away'));

    await expect(port().recompute()).rejects.toThrow('mongo is away');
  });
});
