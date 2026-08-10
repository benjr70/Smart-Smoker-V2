import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import { appTheme, carbonLight } from '../../../theme';
import { SmokeStatusBar } from './SmokeStatusBar';

const START = new Date('2026-08-01T10:00:00.000Z');

const renderBar = (
  props: { smoking: boolean; startedAt: Date | null },
  mode: 'light' | 'dark' = 'dark'
) => {
  // The colour-scheme provider remembers the last mode it was asked for, so a
  // render that wants a named scheme has to start from nothing.
  localStorage.clear();

  return render(
    <CssVarsProvider theme={appTheme} defaultMode={mode}>
      <SmokeStatusBar {...props} />
    </CssVarsProvider>
  );
};

/**
 * The surface an element paints for itself. An element that declares none of
 * these reports every one of them empty, which is what "not a card" looks like
 * to the browser: whatever is behind it shows through.
 */
const chromeOf = (element: HTMLElement) => {
  const style = getComputedStyle(element);
  return {
    background: style.backgroundColor,
    border: style.borderStyle,
    radius: style.borderRadius,
  };
};

const colorOf = (element: HTMLElement): string => getComputedStyle(element).color;

/** The design's colours as the browser reports them. */
const rgb = (hex: string): string => {
  const [r, g, b] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

describe('SmokeStatusBar', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T12:15:30.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('a running cook reads "Smoking" beside a clock counting from its start', () => {
    renderBar({ smoking: true, startedAt: START });

    expect(screen.getByTestId('smoke-status-label')).toHaveTextContent('Smoking');
    expect(screen.getByTestId('smoke-elapsed-clock')).toHaveTextContent('02:15:30');

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId('smoke-elapsed-clock')).toHaveTextContent('02:15:31');
  });

  test('a cook nobody has started reads "Paused" at a clock reading nothing', () => {
    renderBar({ smoking: false, startedAt: null });

    expect(screen.getByTestId('smoke-status-label')).toHaveTextContent('Paused');

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(screen.getByTestId('smoke-elapsed-clock')).toHaveTextContent('00:00:00');
  });

  // A cook the user paused is still that old: the clock counts the cook's age,
  // not the time the smoker spent lit, so it never freezes and then leaps.
  test('a paused cook keeps ageing rather than freezing until it is resumed', () => {
    renderBar({ smoking: false, startedAt: START });

    expect(screen.getByTestId('smoke-elapsed-clock')).toHaveTextContent('02:15:30');

    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    expect(screen.getByTestId('smoke-elapsed-clock')).toHaveTextContent('02:16:00');
  });

  test('the state dot says which state it is showing, for anyone not seeing the colour', () => {
    const { rerender } = renderBar({ smoking: true, startedAt: START });

    expect(screen.getByTestId('smoke-status-dot')).toHaveAttribute('data-smoking', 'true');

    rerender(
      <CssVarsProvider theme={appTheme} defaultMode="dark">
        <SmokeStatusBar smoking={false} startedAt={START} />
      </CssVarsProvider>
    );

    expect(screen.getByTestId('smoke-status-dot')).toHaveAttribute('data-smoking', 'false');
  });

  // The design puts this row on the page itself, above the cards, rather than
  // making it one more card among them.
  test('the row sits on the page background instead of painting a card of its own', () => {
    renderBar({ smoking: true, startedAt: START });

    expect(chromeOf(screen.getByTestId('smoke-status-bar'))).toEqual({
      background: '',
      border: '',
      radius: '',
    });
  });

  test('the label reads in sentence case, the way the design writes it', () => {
    renderBar({ smoking: true, startedAt: START });

    const label = screen.getByTestId('smoke-status-label');

    expect(label).toHaveTextContent('Smoking');
    expect(getComputedStyle(label).textTransform).not.toBe('uppercase');
  });

  // Colour on its own says nothing to anyone who cannot see it — the word and
  // the dot's attribute carry the state. This is the colour reinforcing them:
  // a running cook is the design's green, a stopped one drops to quiet ink.
  test('the label is coloured to reinforce the state its words already give', () => {
    const { rerender } = renderBar({ smoking: true, startedAt: START }, 'light');

    expect(colorOf(screen.getByTestId('smoke-status-label'))).toBe(rgb(carbonLight.success));

    rerender(
      <CssVarsProvider theme={appTheme} defaultMode="light">
        <SmokeStatusBar smoking={false} startedAt={START} />
      </CssVarsProvider>
    );

    expect(colorOf(screen.getByTestId('smoke-status-label'))).toBe(rgb(carbonLight.textSecondary));
  });

  // "02:16:21" alone in the corner of a cooking screen could be a time of day.
  test('the clock is captioned "Elapsed", while the clock itself holds only the time', () => {
    renderBar({ smoking: true, startedAt: START });

    expect(screen.getByTestId('smoke-status-bar')).toHaveTextContent('Elapsed');
    expect(screen.getByTestId('smoke-elapsed-clock').textContent).toBe('02:15:30');
  });
});
