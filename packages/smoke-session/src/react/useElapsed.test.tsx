/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { useElapsed } from './useElapsed';

const START = new Date('2026-08-01T10:00:00.000Z');

/** Move the wall clock — and any interval hanging off it — forward. */
const advance = (ms: number): void => {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
};

describe('useElapsed', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(START);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts up once a second while the cook is running', () => {
    const { result } = renderHook(() => useElapsed(START, true));

    expect(result.current).toBe('00:00:00');

    advance(1000);
    expect(result.current).toBe('00:00:01');

    advance(2000);
    expect(result.current).toBe('00:00:03');
  });

  it('stops counting while the cook is paused', () => {
    const { result, rerender } = renderHook(
      ({ running }: { running: boolean }) => useElapsed(START, running),
      { initialProps: { running: true } }
    );

    advance(5000);
    expect(result.current).toBe('00:00:05');

    rerender({ running: false });
    advance(60_000);

    expect(result.current).toBe('00:00:05');
  });

  it('picks the cook up where it already is when the screen is opened late', () => {
    jest.setSystemTime(new Date('2026-08-01T16:32:14.000Z'));

    const { result } = renderHook(() => useElapsed(START, true));

    expect(result.current).toBe('06:32:14');
  });

  it('reads zero when no start has been recorded', () => {
    const { result } = renderHook(() => useElapsed(null, true));

    advance(5000);

    expect(result.current).toBe('00:00:00');
  });
});
