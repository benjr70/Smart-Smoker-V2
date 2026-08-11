import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import App from './App';

// Mock the components
// The wizard asks to be taken to the history rather than navigating itself, so
// the stand-in offers that request as something this suite can make.
jest.mock('./components/smoke/smoke', () => ({
  Smoke: ({ onViewHistory }: { onViewHistory?: () => void }) => (
    <div data-testid="smoke-component">
      Smoke Component
      <button data-testid="smoke-asks-for-history" onClick={onViewHistory}>
        View History
      </button>
    </div>
  ),
}));

jest.mock('./components/history/history', () => ({
  History: () => <div data-testid="history-component">History Component</div>,
}));

jest.mock('./components/settings/settings', () => ({
  Settings: () => <div data-testid="settings-component">Settings Component</div>,
}));

jest.mock('../src/components/bottomBar/bottombar', () => ({
  BottomBar: ({ smokeOnClick, historyOnClick, settingsOnClick }: any) => (
    <div data-testid="bottom-bar">
      <button data-testid="smoke-button" onClick={smokeOnClick}>
        Smoke
      </button>
      <button data-testid="history-button" onClick={historyOnClick}>
        History
      </button>
      <button data-testid="settings-button" onClick={settingsOnClick}>
        Settings
      </button>
    </div>
  ),
}));

// Mock global fetch so an unexpected network call is observable rather than
// silently attempted.
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockClear();
  mockFetch.mockResolvedValue({ ok: true });
});

describe('App Component', () => {
  test('renders with initial state and smoke component', () => {
    render(<App />);

    expect(screen.getByTestId('smoke-component')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-bar')).toBeInTheDocument();
  });

  test('smokeOnClick sets current screen to HOME', () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('history-button'));
    expect(screen.getByTestId('history-component')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('smoke-button'));
    expect(screen.getByTestId('smoke-component')).toBeInTheDocument();
  });

  test('historyOnClick sets current screen to HISTORY', () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('history-button'));
    expect(screen.getByTestId('history-component')).toBeInTheDocument();
  });

  test('settingsOnClick sets current screen to SETTINGS', () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('settings-button'));
    expect(screen.getByTestId('settings-component')).toBeInTheDocument();
  });

  test('renders correct screen based on state', () => {
    render(<App />);

    expect(screen.getByTestId('smoke-component')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('history-button'));
    expect(screen.getByTestId('history-component')).toBeInTheDocument();
    expect(screen.queryByTestId('smoke-component')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('settings-button'));
    expect(screen.getByTestId('settings-component')).toBeInTheDocument();
    expect(screen.queryByTestId('history-component')).not.toBeInTheDocument();
  });

  test('a finished smoke’s "View History" lands on the History screen', () => {
    // The completion screen's one action. The wizard cannot navigate — the
    // screen in effect is this component's state — so what it does is ask, and
    // what has to be true is that asking gets the user there.
    render(<App />);

    fireEvent.click(screen.getByTestId('smoke-asks-for-history'));

    expect(screen.getByTestId('history-component')).toBeInTheDocument();
    expect(screen.queryByTestId('smoke-component')).not.toBeInTheDocument();
  });

  test('mounting the app subscribes to nothing and asks for no permission', async () => {
    // The silent subscribe-on-mount block is gone: mounting must not register a
    // service worker, must not prompt, and must not POST a subscription. The
    // permission prompt needs a user gesture, which only the settings control
    // supplies.
    const register = jest.fn();
    const requestPermission = jest.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register },
      configurable: true,
    });
    Object.defineProperty(window, 'PushManager', { value: function () {}, configurable: true });
    Object.defineProperty(window, 'Notification', {
      value: { requestPermission },
      configurable: true,
    });

    render(<App />);
    await Promise.resolve();

    expect(register).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();

    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    delete (window as unknown as Record<string, unknown>).PushManager;
    delete (window as unknown as Record<string, unknown>).Notification;
  });
});
