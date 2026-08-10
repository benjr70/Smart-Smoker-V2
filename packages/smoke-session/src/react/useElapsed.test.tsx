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
    const { result } = renderHook(() => useElapsed(START));

    expect(result.current).toBe('00:00:00');

    advance(1000);
    expect(result.current).toBe('00:00:01');

    advance(2000);
    expect(result.current).toBe('00:00:03');
  });

  it('goes on counting while the cook is paused, because the cook is still that old', () => {
    const { result } = renderHook(() => useElapsed(START));

    advance(5000);
    expect(result.current).toBe('00:00:05');

    // Smoking switched off here: the clock measures time since the start was
    // stamped, so a pause does not stop it and a resume cannot make it leap.
    advance(60_000);

    expect(result.current).toBe('00:01:05');
  });

  it('picks the cook up where it already is when the screen is opened late', () => {
    jest.setSystemTime(new Date('2026-08-01T16:32:14.000Z'));

    const { result } = renderHook(() => useElapsed(START));

    expect(result.current).toBe('06:32:14');
  });

  it('reads zero when no start has been recorded', () => {
    const { result } = renderHook(() => useElapsed(null));

    advance(5000);

    expect(result.current).toBe('00:00:00');
  });

  it('drops back to zero when the cook it was counting ends', () => {
    const { result, rerender } = renderHook(
      ({ startedAt }: { startedAt: Date | null }) => useElapsed(startedAt),
      { initialProps: { startedAt: START as Date | null } }
    );

    advance(5000);
    expect(result.current).toBe('00:00:05');

    rerender({ startedAt: null });

    expect(result.current).toBe('00:00:00');
  });
});
