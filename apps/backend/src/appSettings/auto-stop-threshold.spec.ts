import { DEFAULT_AUTO_STOP_IDLE_HOURS } from './app-settings.schema';
import { idleThresholdMsOf } from './auto-stop-threshold';

const HOUR = 60 * 60 * 1000;

describe('idleThresholdMsOf', () => {
  it('reads the stored threshold, in milliseconds', () => {
    expect(idleThresholdMsOf({ autoStop: { idleHours: 4 } })).toBe(4 * HOUR);
  });

  /**
   * The one function both the live auto-stop and the legacy cook-window
   * backfill read this through. A threshold of nothing would make the stop
   * never fire; a threshold of zero would make the backfill call the second
   * reading of every cook a gap and stamp it as zero-length.
   */
  it.each([
    ['a document written before the field existed', {}],
    ['a document of nothing at all', null],
    ['a threshold stored as nothing', { autoStop: { idleHours: null } }],
    ['a threshold of zero', { autoStop: { idleHours: 0 } }],
    ['a negative threshold', { autoStop: { idleHours: -3 } }],
    ['a threshold that is not a number', { autoStop: { idleHours: NaN } }],
    ['a threshold stored as text', { autoStop: { idleHours: '4' } }],
  ])('falls back to the shipped default for %s', (_case, stored) => {
    expect(idleThresholdMsOf(stored)).toBe(DEFAULT_AUTO_STOP_IDLE_HOURS * HOUR);
  });
});
