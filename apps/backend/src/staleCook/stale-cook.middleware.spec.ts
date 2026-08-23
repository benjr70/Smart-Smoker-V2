import { NextFunction, Request, Response } from 'express';
import { StaleCookService } from './stale-cook.service';
import { StaleCookMiddleware } from './stale-cook.middleware';

describe('StaleCookMiddleware', () => {
  let staleCook: { autoStopIfStale: jest.Mock };
  let middleware: StaleCookMiddleware;
  let next: NextFunction;

  const run = (): Promise<void> =>
    middleware.use({} as Request, {} as Response, next);

  beforeEach(() => {
    staleCook = { autoStopIfStale: jest.fn().mockResolvedValue(null) };
    middleware = new StaleCookMiddleware(
      staleCook as unknown as StaleCookService,
    );
    next = jest.fn();
  });

  it('checks the current cook for staleness before the timeline is read', async () => {
    await run();

    expect(staleCook.autoStopIfStale).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('heals the record before the read rather than after it', async () => {
    const order: string[] = [];
    staleCook.autoStopIfStale.mockImplementation(async () => {
      order.push('checked');
      return null;
    });
    next = jest.fn(() => order.push('read'));

    await run();

    // The point of the lazy trigger: the timeline the client is served is the
    // healed one, not the zombie it arrived to.
    expect(order).toEqual(['checked', 'read']);
  });

  // A poll of a running cook is what draws every client's screen. A stop that
  // could not be decided is worth a log line, never a failed read.
  it('serves the timeline even when the staleness check fails', async () => {
    staleCook.autoStopIfStale.mockRejectedValue(new Error('mongo is down'));

    await run();

    expect(next).toHaveBeenCalledTimes(1);
  });
});
