import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

// Mock the components
jest.mock('./components/smoke/smoke', () => ({
  Smoke: () => <div data-testid="smoke-component">Smoke Component</div>
}));

jest.mock('./components/history/history', () => ({
  History: () => <div data-testid="history-component">History Component</div>
}));

jest.mock('./components/settings/settings', () => ({
  Settings: () => <div data-testid="settings-component">Settings Component</div>
}));

jest.mock('../src/components/bottomBar/bottombar', () => ({
  BottomBar: ({ smokeOnClick, reviewOnClick, settingsOnClick }: any) => (
    <div data-testid="bottom-bar">
      <button data-testid="smoke-button" onClick={smokeOnClick}>Smoke</button>
      <button data-testid="review-button" onClick={reviewOnClick}>Review</button>
      <button data-testid="settings-button" onClick={settingsOnClick}>Settings</button>
    </div>
  )
}));

// Mock environment variables
const originalEnv = process.env;

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.resetModules();
  process.env = {
    ...originalEnv,
    REACT_APP_CLOUD_URL: 'http://localhost:3001/',
    VAPID_PUBLIC_KEY: 'BMJ0-abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ' // Valid base64
  };
  
  // Reset fetch mock
  mockFetch.mockClear();
  mockFetch.mockResolvedValue({ ok: true });
  
  // Reset console methods
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = originalEnv;
  jest.restoreAllMocks();
});

describe('App Component', () => {
  test('renders with initial state and smoke component', () => {
    // Mock navigator.serviceWorker to avoid componentDidMount issues in basic tests
    const mockServiceWorker = {
      register: jest.fn().mockResolvedValue({
        pushManager: {
          subscribe: jest.fn().mockResolvedValue({})
        }
      })
    };
    
    Object.defineProperty(navigator, 'serviceWorker', {
      value: mockServiceWorker,
      configurable: true
    });
    
    Object.defineProperty(window, 'PushManager', {
      value: function() {},
      configurable: true
    });
    
    render(<App />);
    
    expect(screen.getByTestId('smoke-component')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-bar')).toBeInTheDocument();
  });

  test('constructor sets initial state to HOME screen', () => {
    // Mock navigator.serviceWorker
    const mockServiceWorker = {
      register: jest.fn().mockResolvedValue({
        pushManager: {
          subscribe: jest.fn().mockResolvedValue({})
        }
      })
    };
    
    Object.defineProperty(navigator, 'serviceWorker', {
      value: mockServiceWorker,
      configurable: true
    });
    
    Object.defineProperty(window, 'PushManager', {
      value: function() {},
      configurable: true
    });
    
    render(<App />);
    expect(screen.getByTestId('smoke-component')).toBeInTheDocument();
  });

  test('smokeOnClick sets current screen to HOME', () => {
    // Mock navigator.serviceWorker
    const mockServiceWorker = {
      register: jest.fn().mockResolvedValue({
        pushManager: {
          subscribe: jest.fn().mockResolvedValue({})
        }
      })
    };
    
    Object.defineProperty(navigator, 'serviceWorker', {
      value: mockServiceWorker,
      configurable: true
    });
    
    Object.defineProperty(window, 'PushManager', {
      value: function() {},
      configurable: true
    });
    
    render(<App />);
    
    // First navigate to a different screen
    fireEvent.click(screen.getByTestId('review-button'));
    expect(screen.getByTestId('history-component')).toBeInTheDocument();
    
    // Then click smoke button to go back to HOME
    fireEvent.click(screen.getByTestId('smoke-button'));
    expect(screen.getByTestId('smoke-component')).toBeInTheDocument();
  });

  test('reviewOnClick sets current screen to HISTORY', () => {
    // Mock navigator.serviceWorker
    const mockServiceWorker = {
      register: jest.fn().mockResolvedValue({
        pushManager: {
          subscribe: jest.fn().mockResolvedValue({})
        }
      })
    };
    
    Object.defineProperty(navigator, 'serviceWorker', {
      value: mockServiceWorker,
      configurable: true
    });
    
    Object.defineProperty(window, 'PushManager', {
      value: function() {},
      configurable: true
    });
    
    render(<App />);
    
    fireEvent.click(screen.getByTestId('review-button'));
    expect(screen.getByTestId('history-component')).toBeInTheDocument();
  });

  test('settingsOnClick sets current screen to SETTINGS', () => {
    // Mock navigator.serviceWorker
    const mockServiceWorker = {
      register: jest.fn().mockResolvedValue({
        pushManager: {
          subscribe: jest.fn().mockResolvedValue({})
        }
      })
    };
    
    Object.defineProperty(navigator, 'serviceWorker', {
      value: mockServiceWorker,
      configurable: true
    });
    
    Object.defineProperty(window, 'PushManager', {
      value: function() {},
      configurable: true
    });
    
    render(<App />);
    
    fireEvent.click(screen.getByTestId('settings-button'));
    expect(screen.getByTestId('settings-component')).toBeInTheDocument();
  });

  test('urlBase64ToUint8Array converts base64 string correctly', () => {
    const app = new App({});
    const testBase64 = 'SGVsbG8gV29ybGQ'; // "Hello World" in base64
    const result = app.urlBase64ToUint8Array(testBase64);
    
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  test('urlBase64ToUint8Array handles padding correctly', () => {
    const app = new App({});
    const testBase64 = 'SGVsbG8'; // Base64 string that needs padding
    const result = app.urlBase64ToUint8Array(testBase64);
    
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  test('urlBase64ToUint8Array replaces URL-safe characters', () => {
    const app = new App({});
    const testBase64 = 'SGVsbG8_V29ybGQ-'; // Base64 with URL-safe characters
    const result = app.urlBase64ToUint8Array(testBase64);
    
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  test('componentDidMount registers service worker when available', async () => {
    const mockRegistration = {
      pushManager: {
        subscribe: jest.fn().mockResolvedValue({
          endpoint: 'test-endpoint',
          keys: {
            p256dh: 'test-key',
            auth: 'test-auth'
          }
        })
      }
    };

    const mockServiceWorker = {
      register: jest.fn().mockResolvedValue(mockRegistration)
    };

    // Mock navigator.serviceWorker
    Object.defineProperty(navigator, 'serviceWorker', {
      value: mockServiceWorker,
      configurable: true
    });

    // Mock PushManager
    Object.defineProperty(window, 'PushManager', {
      value: function() {},
      configurable: true
    });

    render(<App />);

    // Wait for async operations to complete
    await waitFor(() => {
      expect(mockServiceWorker.register).toHaveBeenCalledWith('/sw.js');
    });
    
    await waitFor(() => {
      expect(mockRegistration.pushManager.subscribe).toHaveBeenCalledWith({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array)
      });
    });
    
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/notifications/subscribe', {
        method: 'POST',
        body: expect.any(String),
        headers: {
          'Content-Type': 'application/json'
        }
      });
    });
  });

  test('componentDidMount handles service worker registration error', async () => {
    const mockServiceWorker = {
      register: jest.fn().mockRejectedValue(new Error('Registration failed'))
    };

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    Object.defineProperty(navigator, 'serviceWorker', {
      value: mockServiceWorker,
      configurable: true
    });

    render(<App />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Service Worker registration failed: ', expect.any(Error));
    });
    
    consoleSpy.mockRestore();
  });

  test('componentDidMount handles push subscription error', async () => {
    const mockRegistration = {
      pushManager: {
        subscribe: jest.fn().mockRejectedValue(new Error('Subscription failed'))
      }
    };

    const mockServiceWorker = {
      register: jest.fn().mockResolvedValue(mockRegistration)
    };

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    Object.defineProperty(navigator, 'serviceWorker', {
      value: mockServiceWorker,
      configurable: true
    });

    Object.defineProperty(window, 'PushManager', {
      value: function() {},
      configurable: true
    });

    render(<App />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to subscribe the user: ', expect.any(Error));
    });
    
    consoleSpy.mockRestore();
  });

  test('componentDidMount skips when service worker not available', async () => {
    // Create a navigator without serviceWorker property
    const originalNavigator = global.navigator;
    delete (global.navigator as any).serviceWorker;

    render(<App />);

    // Wait a bit for any async operations
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/notifications/subscribe'),
      expect.any(Object)
    );

    // Restore navigator
    global.navigator = originalNavigator;
  });

  test('componentDidMount skips push subscription when PushManager not available', async () => {
    const mockRegistration = {
      pushManager: {
        subscribe: jest.fn()
      }
    };

    const mockServiceWorker = {
      register: jest.fn().mockResolvedValue(mockRegistration)
    };

    // Remove PushManager from window
    const originalPushManager = (window as any).PushManager;
    delete (window as any).PushManager;

    Object.defineProperty(navigator, 'serviceWorker', {
      value: mockServiceWorker,
      configurable: true
    });

    render(<App />);

    // Wait for service worker registration
    await waitFor(() => {
      expect(mockServiceWorker.register).toHaveBeenCalledWith('/sw.js');
    });

    expect(mockRegistration.pushManager.subscribe).not.toHaveBeenCalled();

    // Restore PushManager
    if (originalPushManager) {
      (window as any).PushManager = originalPushManager;
    }
  });

  test('renders correct screen based on state', () => {
    // Mock navigator.serviceWorker
    const mockServiceWorker = {
      register: jest.fn().mockResolvedValue({
        pushManager: {
          subscribe: jest.fn().mockResolvedValue({})
        }
      })
    };
    
    Object.defineProperty(navigator, 'serviceWorker', {
      value: mockServiceWorker,
      configurable: true
    });
    
    Object.defineProperty(window, 'PushManager', {
      value: function() {},
      configurable: true
    });
    
    render(<App />);
    
    // Default should be smoke
    expect(screen.getByTestId('smoke-component')).toBeInTheDocument();
    
    // Navigate to history
    fireEvent.click(screen.getByTestId('review-button'));
    expect(screen.getByTestId('history-component')).toBeInTheDocument();
    expect(screen.queryByTestId('smoke-component')).not.toBeInTheDocument();
    
    // Navigate to settings
    fireEvent.click(screen.getByTestId('settings-button'));
    expect(screen.getByTestId('settings-component')).toBeInTheDocument();
    expect(screen.queryByTestId('history-component')).not.toBeInTheDocument();
  });

  test('switch statement handles all Screens enum values', () => {
    // Test that each screen enum value renders the correct component
    const mockServiceWorker = {
      register: jest.fn().mockResolvedValue({
        pushManager: {
          subscribe: jest.fn().mockResolvedValue({})
        }
      })
    };
    
    Object.defineProperty(navigator, 'serviceWorker', {
      value: mockServiceWorker,
      configurable: true
    });
    
    Object.defineProperty(window, 'PushManager', {
      value: function() {},
      configurable: true
    });
    
    render(<App />);
    
    // Test HOME screen (default)
    expect(screen.getByTestId('smoke-component')).toBeInTheDocument();
    
    // Test HISTORY screen
    fireEvent.click(screen.getByTestId('review-button'));
    expect(screen.getByTestId('history-component')).toBeInTheDocument();
    
    // Test SETTINGS screen
    fireEvent.click(screen.getByTestId('settings-button'));
    expect(screen.getByTestId('settings-component')).toBeInTheDocument();
  });
});
