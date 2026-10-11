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

/** What the capability check reads of the browser, and the test sets. */
const PHONE_PARTS: [object, string][] = [
  [window, 'crossOriginIsolated'],
  [window.navigator, 'mediaDevices'],
  [window.navigator, 'gpu'],
];

/** Makes the browser one that can run Voice Fill, but for what `missing` takes away. */
const phoneIs = (missing: 'nothing' | 'microphone' | 'adapter' | 'isolation'): void => {
  const parts = [
    missing !== 'isolation',
    missing === 'microphone' ? undefined : { getUserMedia: () => Promise.resolve({}) },
    { requestAdapter: () => Promise.resolve(missing === 'adapter' ? null : {}) },
  ];
  PHONE_PARTS.forEach(([owner, name], part) => {
    Object.defineProperty(owner, name, { configurable: true, value: parts[part] });
  });
};

/** Puts the browser back as the test environment has it: able to run nothing. */
const phoneIsAsFound = (): void => {
  PHONE_PARTS.forEach(([owner, name]) => {
    delete (owner as Record<string, unknown>)[name];
  });
};

// The real speech model's files are not fetched here: its downloader is stood
// in for by the scripted one, which keeps what has "arrived" on the phone.
jest.mock('./voiceFill/moonshineModel', () => {
  const { createFakeDownloader } = jest.requireActual('./voiceFill/fakeDownloader');
  return {
    ...jest.requireActual('./voiceFill/moonshineModel'),
    createMoonshineDownloader: () => createFakeDownloader({ storage: globalThis.localStorage }),
  };
});

jest.mock('./components/smoke/smoke', () => ({
  Smoke: () => {
    const { pairReadiness, useModelLibrary } = jest.requireActual('./voiceFill');
    const models = useModelLibrary();
    return (
      <div data-testid="smoke-component">
        {models ? (
          <button onClick={models.openSettings}>
            pair {pairReadiness(models.library.registry, models.state).state}
            {models.state.supported === false && ', phone cannot run Voice Fill'}
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

/**
 * The real extraction model's adapter, which needs the LiteRT-LM runtime and a
 * GPU: here its download reports a first part and stays open.
 */
const mockAdapter = {
  download: jest.fn(),
  testLoad: jest.fn(),
  createExtractor: jest.fn(),
};
jest.mock('./voiceFill/liteRtAdapter', () => mockAdapter);

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
    mockAdapter.download
      .mockReset()
      .mockImplementation(
        (_file: unknown, _store: unknown, options: { onProgress: (received: number) => void }) => {
          options.onProgress(1_000_000);
          return new Promise<void>(() => undefined);
        }
      );
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    window.localStorage.clear();
    process.env.REACT_APP_VOICE_FILL_SCRIPTED = 'true';
    window.history.replaceState(null, '', '/?voiceFill=scripted');
    phoneIs('nothing');
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    phoneIsAsFound();
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

  test.each<['microphone' | 'adapter' | 'isolation']>([['microphone'], ['adapter'], ['isolation']])(
    'downloads nothing on a phone with no %s, which cannot run Voice Fill',
    async missing => {
      phoneIs(missing);

      render(<App />);
      await pass(5000);

      expect(screen.getByTestId('smoke-component')).toHaveTextContent(
        'pair notDownloaded, phone cannot run Voice Fill'
      );
      expect(window.localStorage.getItem('voiceFill.scriptedModelLibrary')).toBeNull();
      expect(window.localStorage.getItem('voiceFill.fakeDownloads')).toBeNull();
    }
  );

  test('is the real one where the scripted models were not asked for: the registered pair downloads, each model through its own downloader', async () => {
    window.history.replaceState(null, '', '/');
    // The real extraction model's file arrives when the test lets it.
    let arrive: () => void = () => undefined;
    mockAdapter.download.mockImplementation(
      (_file: unknown, _store: unknown, options: { onProgress: (received: number) => void }) => {
        options.onProgress(1_000_000);
        return new Promise<void>(resolve => {
          arrive = resolve;
        });
      }
    );
    mockAdapter.testLoad.mockReset().mockResolvedValue(true);

    render(<App />);
    await pass(0);

    expect(screen.getByTestId('smoke-component')).toHaveTextContent('pair downloading');
    expect(mockAdapter.download).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('voiceFill.modelLibrary')).toContain(
      'moonshine-small-streaming'
    );
    expect(window.localStorage.getItem('voiceFill.modelLibrary')).toContain('gemma-4-e2b-litert');
    expect(window.localStorage.getItem('voiceFill.scriptedModelLibrary')).toBeNull();

    // The speech model alone is not the pair: it waits on the extraction model.
    await pass(5000);
    expect(screen.getByTestId('smoke-component')).toHaveTextContent('pair downloading');

    arrive();
    await pass(5000);
    expect(screen.getByTestId('smoke-component')).toHaveTextContent('pair ready');
  });

  test('the real one downloads nothing on a phone that cannot run Voice Fill', async () => {
    window.history.replaceState(null, '', '/');
    phoneIs('adapter');

    render(<App />);
    await pass(5000);

    expect(screen.getByTestId('smoke-component')).toHaveTextContent(
      'pair notDownloaded, phone cannot run Voice Fill'
    );
    expect(mockAdapter.download).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('voiceFill.modelLibrary')).toBeNull();
    expect(window.localStorage.getItem('voiceFill.fakeDownloads')).toBeNull();
  });
});
