/**
 * The stamp bar under the chart on the pit: the one thing the touchscreen does
 * to the cook log.
 *
 * It is used with a glove on, beside a hot smoker, by somebody who is holding
 * something in the other hand — so every question a test asks of it is one the
 * pitmaster asks: what can I tap, what did I tap last, and did it go in?
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { carbonDark, resolveDesignPalette } from 'theme/src';
import { CookEvent, CookStamp } from '../../api';
import { toneColor } from '../../theme/stampTones';
import { FLASH_MS, SmokerEventBar } from './SmokerEventBar';

const stamp = (key: string, label: string, enabled = true): CookStamp => ({
  key,
  label,
  tone: 'amber',
  enabled,
  custom: false,
});

const logged = (id: string, stampKey: string, at: string): CookEvent => ({
  _id: id,
  smokeId: 'smoke-1',
  stampKey,
  label: stampKey,
  tone: 'amber',
  at: new Date(at),
  chamberTemp: 225,
  probe1Temp: null,
  probe2Temp: null,
  probe3Temp: null,
});

/** The clock time a reader of this panel would see beside a logged stamp. */
const clockOf = (at: string): string =>
  new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

const button = (key: string): HTMLElement => screen.getByTestId(`smoker-stamp-${key}`);

interface BarOptions {
  stamps?: CookStamp[];
  events?: CookEvent[];
  smoking?: boolean;
  onRecord?: (stampKey: string) => Promise<boolean>;
}

const renderBar = ({
  stamps = [stamp('wood', 'Added Wood'), stamp('wrap', 'Wrapped')],
  events = [],
  smoking = true,
  onRecord = async () => true,
}: BarOptions = {}) =>
  render(<SmokerEventBar stamps={stamps} events={events} smoking={smoking} onRecord={onRecord} />);

describe('the stamp bar on the touchscreen', () => {
  it('offers the stamps the user left switched on, in catalogue order', () => {
    renderBar({
      stamps: [
        stamp('spritz', 'Spritzed'),
        stamp('wrap', 'Wrapped', false),
        stamp('wood', 'Added Wood'),
      ],
    });

    expect(screen.getAllByRole('button').map(b => b.getAttribute('data-testid'))).toEqual([
      'smoker-stamp-spritz',
      'smoker-stamp-wood',
    ]);
    // A stamp switched off is not offered; its history stays legible elsewhere.
    expect(screen.queryByTestId('smoker-stamp-wrap')).toBeNull();
  });

  /**
   * The whole reason the time is on the button: standing at the smoker, the
   * question is not "was this ever done" but "how long ago did I do it".
   */
  it('prints the clock time each stamp was last tapped at in this cook', () => {
    renderBar({
      events: [
        logged('e1', 'wood', '2026-08-27T12:00:00.000Z'),
        logged('e2', 'wood', '2026-08-27T14:30:00.000Z'),
      ],
    });

    expect(button('wood')).toHaveTextContent(clockOf('2026-08-27T14:30:00.000Z'));
    // Never tapped this cook: a dash rather than a blank, so the button is
    // plainly a button that has not been used rather than one still loading.
    expect(button('wrap')).toHaveTextContent('—');
  });

  it('draws each stamp in its own tone, so a button matches its markers', () => {
    renderBar({ stamps: [{ ...stamp('wood', 'Added Wood'), tone: 'p1' }] });

    // The first probe's own colour: the same one its line is drawn in on the
    // chart above, and the same one this stamp's markers carry.
    expect(screen.getByTestId('smoker-stamp-tone-wood')).toHaveStyle({
      backgroundColor: toneColor('p1', resolveDesignPalette(carbonDark, 'dark')),
    });
  });

  it('is 130 across so the row plainly runs past the edge of the panel', () => {
    renderBar();

    expect(button('wood')).toHaveStyle({ width: '130px' });
    expect(screen.getByTestId('smoker-stamp-bar')).toHaveStyle({ overflowX: 'auto' });
  });

  describe('tapping a stamp', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('logs the tap and says so for a moment', async () => {
      const posted: string[] = [];
      renderBar({
        onRecord: async key => {
          posted.push(key);
          return true;
        },
      });

      fireEvent.click(button('wood'));

      // The button says so once the backend has taken it, never before: what
      // it is reporting is what was stored, not what was pressed.
      await waitFor(() => expect(button('wood')).toHaveTextContent('Logged'));
      expect(posted).toEqual(['wood']);

      // And then goes back to being a button, so the next tap is never blocked
      // by the last one's news.
      act(() => {
        jest.advanceTimersByTime(FLASH_MS);
      });
      expect(button('wood')).not.toHaveTextContent('Logged');
      expect(button('wood')).toHaveTextContent('Added Wood');
    });

    /**
     * A tap the backend refused must leave nothing behind: no entry, no time on
     * the button, and no doubt about it. There is no offline queue on the pit —
     * an event stamped from a clock nobody can vouch for is worse than one that
     * was never logged.
     */
    it('says a refused tap was not logged, and adds nothing', async () => {
      renderBar({ onRecord: async () => false });

      fireEvent.click(button('wood'));

      await waitFor(() => expect(button('wood')).toHaveTextContent('Not logged'));
      act(() => {
        jest.advanceTimersByTime(FLASH_MS);
      });
      // Back to a button that has never been tapped this cook.
      expect(button('wood')).toHaveTextContent('—');
    });
  });

  /**
   * Nothing is being cooked, so nothing can be stamped against a cook. The row
   * stays where it is rather than vanishing: a row that disappeared would move
   * every button under the thumb reaching for it the moment the smoker is lit.
   */
  describe('while nothing is cooking', () => {
    it('offers the buttons plainly out of use', () => {
      renderBar({ smoking: false });

      expect(button('wood')).toBeDisabled();
      expect(screen.getByTestId('smoker-stamp-bar')).toHaveStyle({ opacity: '0.4' });
    });

    it('logs nothing when one is pressed anyway', () => {
      const posted: string[] = [];
      renderBar({
        smoking: false,
        onRecord: async key => {
          posted.push(key);
          return true;
        },
      });

      fireEvent.click(button('wood'));

      expect(posted).toEqual([]);
    });
  });

  /** A mis-tap is undone on a phone; there is no × to catch a glove out here. */
  it('offers no way to delete an entry', () => {
    renderBar({ events: [logged('e1', 'wood', '2026-08-27T12:00:00.000Z')] });

    expect(screen.queryByRole('button', { name: /remove|delete/i })).toBeNull();
  });
});
