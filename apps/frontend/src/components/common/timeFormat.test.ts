/**
 * How the history screens write about time.
 *
 * Every number here is an admission problem as much as a formatting one: a cook
 * whose length or moments are not on record shows an em-dash, never an invented
 * zero. The rules are argued about here, against pure functions, so the header
 * and the section grids do not each grow their own.
 */
import { formatClockTime, formatCookDuration, formatDateLabel, formatRestTime } from './timeFormat';

describe('formatCookDuration', () => {
  it('writes a length in the design’s hours-and-minutes', () => {
    expect(formatCookDuration(6 * 60 * 60 * 1000 + 20 * 60 * 1000)).toBe('6h 20m');
  });

  it('pads a single-digit minute so 6h 05m reads as a clock does', () => {
    expect(formatCookDuration(6 * 60 * 60 * 1000 + 5 * 60 * 1000)).toBe('6h 05m');
  });

  it('admits an unknown length as an em-dash', () => {
    expect(formatCookDuration(null)).toBe('—');
    expect(formatCookDuration(-1)).toBe('—');
    expect(formatCookDuration(Number.NaN)).toBe('—');
  });
});

describe('formatClockTime', () => {
  it('writes a moment as a 12-hour clock reading', () => {
    expect(formatClockTime(new Date(2026, 3, 20, 9, 15))).toBe('9:15 AM');
    expect(formatClockTime(new Date(2026, 3, 20, 15, 35))).toBe('3:35 PM');
  });

  it('admits an unknown moment as an em-dash', () => {
    expect(formatClockTime(null)).toBe('—');
  });
});

describe('formatDateLabel', () => {
  it('writes a day the way the history cards do', () => {
    expect(formatDateLabel(new Date(2026, 3, 20, 9, 15))).toBe('Apr 20, 2026');
  });

  it('admits an unknown day as an em-dash', () => {
    expect(formatDateLabel(null)).toBe('—');
  });
});

describe('formatRestTime', () => {
  it('humanizes the wizard’s HH:MM into hours and minutes', () => {
    expect(formatRestTime('01:30')).toBe('1h 30m');
  });

  it('drops the hours when the rest was under one', () => {
    expect(formatRestTime('00:45')).toBe('45m');
  });

  it('passes free text through untouched, since old records were typed by hand', () => {
    expect(formatRestTime('about an hour')).toBe('about an hour');
  });

  it('admits a blank rest as an em-dash', () => {
    expect(formatRestTime('')).toBe('—');
    expect(formatRestTime('   ')).toBe('—');
  });
});
