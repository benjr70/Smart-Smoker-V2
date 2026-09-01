import '@testing-library/jest-dom';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { DesignSurface, appTheme } from '../../../theme';
import { RestTimerCard, RestTimerCardProps } from './RestTimerCard';

const PULL_AT = new Date('2026-08-30T17:00:00.000Z');

const renderCard = (props: Partial<RestTimerCardProps> = {}) =>
  render(
    <CssVarsProvider theme={appTheme}>
      <DesignSurface>
        <RestTimerCard pullAt={PULL_AT} pullTemp={203} restMinutes={60} weightLb={14} {...props} />
      </DesignSurface>
    </CssVarsProvider>
  );

describe('the rest timer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Ten minutes into the rest: the ordinary state of the card, so a test
    // about anything else does not have to set the clock to see it.
    jest.setSystemTime(new Date('2026-08-30T17:10:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts down from the pull to the end of the rest', () => {
    renderCard();

    expect(screen.getByTestId('rest-timer-remaining')).toHaveTextContent('50:00');
  });

  it('counts down as the rest is watched, without being re-mounted', () => {
    renderCard();

    act(() => {
      jest.advanceTimersByTime(90_000);
    });

    expect(screen.getByTestId('rest-timer-remaining')).toHaveTextContent('48:30');
  });

  it('shows how far through the rest the meat is', () => {
    renderCard();

    // Ten minutes of an hour, which is what the bar has to say for itself to
    // somebody who is reading it rather than the clock beside it.
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '17');
  });

  /**
   * A rest of nothing is a real plan — some cuts are carved off the pit — and
   * the card has to say so rather than divide the elapsed time by no rest.
   */
  it('reads as ready straight away for a cook that rests for no time at all', () => {
    jest.setSystemTime(new Date('2026-08-30T17:00:00.000Z'));

    renderCard({ restMinutes: 0 });

    expect(screen.getByTestId('rest-timer-remaining')).toHaveTextContent('Ready to slice');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('says the meat is ready to slice once the rest is over, and counts no further', () => {
    jest.setSystemTime(new Date('2026-08-30T18:05:00.000Z'));

    renderCard();

    expect(screen.getByTestId('rest-timer-remaining')).toHaveTextContent('Ready to slice');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
});

/**
 * The meat goes on cooking after it comes off, and how far depends on how big
 * it is: a whole packer carries several degrees further than a pork loin.
 */
describe('the carryover the rest is expected to add', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-30T17:10:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('takes a large cut further than a small one, and says by how much', () => {
    renderCard({ pullTemp: 203, weightLb: 14 });

    const carryover = screen.getByTestId('rest-timer-carryover');
    expect(carryover).toHaveTextContent('213°F');
    expect(carryover).toHaveTextContent('+10°');
  });

  it('takes a small cut the smaller rise', () => {
    renderCard({ pullTemp: 165, weightLb: 4 });

    const carryover = screen.getByTestId('rest-timer-carryover');
    expect(carryover).toHaveTextContent('170°F');
    expect(carryover).toHaveTextContent('+5°');
  });

  /**
   * A cook nobody weighed is given the smaller rise: the peak is a claim about
   * where the meat will top out, and the lesser claim is the one that does not
   * talk somebody into pulling early on a brisket the app knows nothing about.
   */
  it('takes an unweighed cut the smaller rise', () => {
    renderCard({ pullTemp: 200, weightLb: null });

    expect(screen.getByTestId('rest-timer-carryover')).toHaveTextContent('205°F');
  });

  /**
   * Nothing was measuring this meat, so there is no temperature to carry over
   * from — and a peak invented from nothing would be the card's own guess
   * rendered as a fact.
   */
  it('says nothing about a peak for a cook pulled with no probe watched', () => {
    renderCard({ pullTemp: null });

    expect(screen.queryByTestId('rest-timer-carryover')).not.toBeInTheDocument();
  });
});

/**
 * Cooked meat held warm is safe for about four hours from the pull; after that
 * it is a food-safety decision rather than a serving one, so the window is on
 * the card the whole time rather than remembered.
 */
describe('the safe-to-hold window', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('says how much of the four hours from the pull is left', () => {
    jest.setSystemTime(new Date('2026-08-30T18:00:00.000Z'));

    renderCard();

    expect(screen.getByTestId('rest-timer-safe-hold')).toHaveTextContent('3h 00m');
  });

  it('reads as ordinary while there is plenty of the window left', () => {
    jest.setSystemTime(new Date('2026-08-30T18:00:00.000Z'));

    renderCard();

    expect(screen.getByTestId('rest-timer-safe-hold')).toHaveAttribute('data-urgent', 'false');
  });

  it('turns urgent as the window runs short', () => {
    jest.setSystemTime(new Date('2026-08-30T20:45:00.000Z'));

    renderCard();

    const safeHold = screen.getByTestId('rest-timer-safe-hold');
    expect(safeHold).toHaveTextContent('15m');
    expect(safeHold).toHaveAttribute('data-urgent', 'true');
  });

  /**
   * The window is counted down in whole minutes it still has, not in whole
   * minutes it is nearest to: a line reading "1h 00m" with fifty seconds of
   * that hour already spent is promising time the meat does not have, and it is
   * the one number on the card a pitmaster might plan the table around.
   */
  it('counts only the whole minutes the window still has', () => {
    jest.setSystemTime(new Date('2026-08-30T18:00:50.000Z'));

    renderCard();

    expect(screen.getByTestId('rest-timer-safe-hold')).toHaveTextContent('2h 59m');
  });

  /**
   * And the other end of the same rounding: twenty seconds of the four hours
   * are still twenty seconds of it, so the card must not have called the window
   * gone half a minute before it is.
   */
  it('holds off saying to serve now while seconds of the window remain', () => {
    jest.setSystemTime(new Date('2026-08-30T20:59:40.000Z'));

    renderCard();

    const safeHold = screen.getByTestId('rest-timer-safe-hold');
    expect(safeHold).toHaveTextContent('Safe to hold under a minute');
    expect(safeHold).toHaveAttribute('data-urgent', 'true');
  });

  it('says to serve now once the window is gone', () => {
    jest.setSystemTime(new Date('2026-08-30T21:30:00.000Z'));

    renderCard();

    const safeHold = screen.getByTestId('rest-timer-safe-hold');
    expect(safeHold).toHaveTextContent('Serve now');
    expect(safeHold).toHaveAttribute('data-urgent', 'true');
  });
});
