/**
 * The Model library at the application root: opened with the app whichever
 * screen is up, and able to send the user to Settings.
 *
 * The screens are stood in for by ones that only say what the library the root
 * hands them holds; the root, its bar and the library are the real ones.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import App from './App';

jest.mock('./components/smoke/smoke', () => ({
  Smoke: () => {
    const { pairReadiness, useModelLibrary } = jest.requireActual('./voiceFill');
    const models = useModelLibrary();
    return (
      <div data-testid="smoke-component">
        {models ? (
          <button onClick={models.openSettings}>
            pair {pairReadiness(models.library.registry, models.state).state}
          </button>
        ) : (
          'no Model library'
        )}
      </div>
    );
  },
}));
jest.mock('./components/history/history', () => ({
  History: () => {
    const { pairReadiness, useModelLibrary } = jest.requireActual('./voiceFill');
    const models = useModelLibrary();
    return (
      <div data-testid="history-component">
        pair {models ? pairReadiness(models.library.registry, models.state).state : 'absent'}
      </div>
    );
  },
}));
jest.mock('./components/settings/settings', () => ({
  Settings: () => <div data-testid="settings-component" />,
}));
jest.mock('./components/stats/stats', () => ({
  Stats: () => <div data-testid="stats-component" />,
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** Lets `ms` of downloading go by, and what it finishes land. */
const pass = async (ms: number): Promise<void> => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    for (let turn = 0; turn < 20; turn += 1) {
      await Promise.resolve();
    }
  });
};

describe('the Model library at the application root', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    window.localStorage.clear();
    process.env.REACT_APP_VOICE_FILL_SCRIPTED = 'true';
    window.history.replaceState(null, '', '/?voiceFill=scripted');
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    delete process.env.REACT_APP_VOICE_FILL_SCRIPTED;
    window.history.replaceState(null, '', '/');
  });

  test('starts the default pair downloading the first time the app is opened, on any screen', async () => {
    render(<App />);
    await pass(0);

    expect(screen.getByTestId('smoke-component')).toHaveTextContent('pair downloading');

    // Leaving the screen the app opened on does not stop it.
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(screen.getByTestId('history-component')).toHaveTextContent('pair downloading');

    await pass(5000);
    expect(screen.getByTestId('history-component')).toHaveTextContent('pair ready');
  });

  test('picks the download up when the app is reopened', async () => {
    const { unmount } = render(<App />);
    await pass(100);
    unmount();
    await pass(5000);

    render(<App />);
    await pass(0);
    expect(screen.getByTestId('smoke-component')).toHaveTextContent('pair downloading');

    await pass(5000);
    expect(screen.getByTestId('smoke-component')).toHaveTextContent('pair ready');
  });

  test('takes a screen that asks for the Voice Fill settings to the settings screen', async () => {
    render(<App />);
    await pass(0);

    fireEvent.click(screen.getByRole('button', { name: 'pair downloading' }));

    expect(screen.getByTestId('settings-component')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveClass('Mui-selected');
  });

  test('is not there where the application has no models to run', async () => {
    window.history.replaceState(null, '', '/');

    render(<App />);
    await pass(5000);

    expect(screen.getByTestId('smoke-component')).toHaveTextContent('no Model library');
    expect(window.localStorage.getItem('voiceFill.modelLibrary')).toBeNull();
  });
});
