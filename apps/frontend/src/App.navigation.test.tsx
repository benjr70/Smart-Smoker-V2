/**
 * Where the bottom bar says the user is, against where the user actually is.
 *
 * The screens are stood in for, but the bar is the real one: the point of this
 * suite is the agreement between the two, and a stand-in bar agrees with
 * anything. Until now the only thing that changed screens was a tap on the bar
 * itself, so the bar could keep its own idea of the destination in effect and
 * never be caught out. Finishing a smoke ends on a completion screen whose one
 * action navigates for the user — and that is a way of arriving somewhere that
 * the bar never hears about, so what it lights has to be read off the screen in
 * effect rather than remembered.
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import App from './App';

jest.mock('./components/smoke/smoke', () => ({
  Smoke: ({
    onViewHistory,
    onOpenSettings,
  }: {
    onViewHistory?: () => void;
    onOpenSettings?: () => void;
  }) => (
    <div data-testid="smoke-component">
      <button data-testid="smoke-complete-view-history" onClick={onViewHistory}>
        View History
      </button>
      <button data-testid="smoke-completion-settings" onClick={onOpenSettings}>
        Watch a probe in Settings
      </button>
    </div>
  ),
}));
jest.mock('./components/history/history', () => ({
  History: () => <div data-testid="history-component" />,
}));
jest.mock('./components/settings/settings', () => ({
  Settings: () => <div data-testid="settings-component" />,
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockClear();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
});

/** A destination, looked up the way the user finds it: by what it reads. */
const destination = (name: string): HTMLElement => screen.getByRole('button', { name });

/** What the bar is lighting, as a list, the way a person reading it would. */
const litDestinations = (): string[] =>
  ['Smoke', 'History', 'Settings'].filter(name =>
    destination(name).classList.contains('Mui-selected')
  );

describe('the destination the bottom bar lights', () => {
  it('is the one the application opens on', () => {
    render(<App />);

    expect(litDestinations()).toEqual(['Smoke']);
  });

  it('follows a tapped destination', () => {
    render(<App />);

    fireEvent.click(destination('Settings'));

    expect(screen.getByTestId('settings-component')).toBeInTheDocument();
    expect(litDestinations()).toEqual(['Settings']);
  });

  it('follows a finished smoke’s "View History" as well as a tap', () => {
    // The regression: the completion screen took the user to the history, and
    // the bar went on lighting SMOKE — so the history was read under the wrong
    // tab, in accent, twice over in manual verification.
    render(<App />);

    fireEvent.click(screen.getByTestId('smoke-complete-view-history'));

    expect(screen.getByTestId('history-component')).toBeInTheDocument();
    expect(screen.queryByTestId('smoke-component')).not.toBeInTheDocument();
    expect(litDestinations()).toEqual(['History']);
  });

  it('follows the completion card’s way to the settings', () => {
    // The estimate cannot be made until a probe is being watched, and the card
    // says so with a link — which has to actually arrive at the settings
    // screen, under the tab that names it.
    render(<App />);

    fireEvent.click(screen.getByTestId('smoke-completion-settings'));

    expect(screen.getByTestId('settings-component')).toBeInTheDocument();
    expect(litDestinations()).toEqual(['Settings']);
  });

  it('goes back to lighting Smoke when the user taps back', () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('smoke-complete-view-history'));
    fireEvent.click(destination('Smoke'));

    expect(screen.getByTestId('smoke-component')).toBeInTheDocument();
    expect(litDestinations()).toEqual(['Smoke']);
  });
});
