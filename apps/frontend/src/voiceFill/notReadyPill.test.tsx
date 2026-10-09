import '@testing-library/jest-dom';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import React, { useState } from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../api';
import { createFakeBackend } from '../api/fakeBackend';
import { WeightUnits } from '../components/common/interfaces/enums';
import { Settings } from '../components/settings/settings';
import { PreSmokeStep } from '../components/smoke/preSmokeStep/preSmokeStep';
import { DesignSurface, appTheme } from '../theme';
import { createFakeExtractor, createFakeSpeech } from './fakeAdapters';
import { createFakeDownloader } from './fakeDownloader';
import type { ModelLibrary, ModelLibraryOptions } from './modelLibrary';
import { createModelLibrary } from './modelLibrary';
import { ModelLibraryProvider } from './ModelLibraryProvider';
import { createModelRegistry } from './modelRegistry';
import type { PhoneEnvironment } from './phoneEnvironment';
import { canRunVoiceFill } from './phoneEnvironment';
import { VoiceFillPortsProvider } from './VoiceFillPortsProvider';

// The websocket the settings screen's stamp catalogue is announced on.
jest.mock('socket.io-client', () => ({
  io: () => ({ on: () => undefined, off: () => undefined, close: () => undefined }),
}));

const MB = 1_000_000;

const registry = createModelRegistry([
  { id: 'speech-a', role: 'speech', name: 'Speech A', sizeBytes: 100 * MB },
  { id: 'extractor-a', role: 'extractor', name: 'Extractor A', sizeBytes: 300 * MB },
]);

const speech = createFakeSpeech({ transcript: 'Sixteen pound brisket.', wordIntervalMs: 1 });
const extractor = createFakeExtractor({ raw: { weight: 16 } });

/** Lets `ms` of downloading go by, and what it finishes land. */
const pass = async (ms: number): Promise<void> => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    for (let turn = 0; turn < 20; turn += 1) {
      await Promise.resolve();
    }
  });
};

const createLibrary = (options: Partial<ModelLibraryOptions> = {}): ModelLibrary =>
  createModelLibrary({
    registry,
    downloader: createFakeDownloader({ storage: window.localStorage, chunkMs: 100, chunks: 10 }),
    storage: window.localStorage,
    capabilities: () => Promise.resolve(true),
    ...options,
  });

type Screen = 'smoke' | 'settings';

/**
 * As much of the application as Voice Fill reaches: the Model library and the
 * models above whichever screen is up, the pre-smoke screen, the settings
 * screen, and a root that knows how to show the second.
 */
function AppShell({ library, start }: { library: ModelLibrary; start: Screen }): JSX.Element {
  const [shown, setShown] = useState<Screen>(start);
  return (
    <ModelLibraryProvider library={library} onOpenSettings={() => setShown('settings')}>
      <VoiceFillPortsProvider speech={speech} extractor={extractor}>
        {shown === 'smoke' ? <PreSmokeStep nextButton={<button>Next</button>} /> : <Settings />}
      </VoiceFillPortsProvider>
    </ModelLibraryProvider>
  );
}

const backendWithACook = () =>
  createFakeBackend({
    preSmoke: {
      current: {
        name: 'Test Smoke',
        meatType: 'Ribs',
        weight: { weight: 10, unit: WeightUnits.LB },
        steps: [],
        notes: '',
      },
    },
  });

const openApp = async (library: ModelLibrary, start: Screen = 'smoke') => {
  const backend = backendWithACook();
  const view = render(
    <CssVarsProvider theme={appTheme}>
      <DesignSurface>
        <ApiClientProvider client={createApiClient(backend)}>
          <SnackbarProvider>
            <AppShell library={library} start={start} />
          </SnackbarProvider>
        </ApiClientProvider>
      </DesignSurface>
    </CssVarsProvider>
  );
  await pass(0);
  return { backend, ...view };
};

const voiceFillButton = () => screen.queryByRole('button', { name: 'Voice fill' });
const pill = () => screen.queryByTestId('voice-fill-pill');
const card = () => screen.queryByTestId('settings-voice-fill-card');

describe('the Voice Fill button while the picked pair is not ready', () => {
  const scrollIntoView = jest.fn();

  beforeEach(() => {
    window.localStorage.clear();
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  test('is a grey pill saying how far the download is, until the pair is ready', async () => {
    await openApp(createLibrary());
    await screen.findByDisplayValue('Test Smoke');

    expect(pill()).toHaveTextContent('Model downloading 0%');
    expect(voiceFillButton()).not.toBeInTheDocument();

    await pass(500);
    expect(pill()).toHaveTextContent('Model downloading 50%');

    await pass(500);
    expect(pill()).not.toBeInTheDocument();
    expect(voiceFillButton()).toBeInTheDocument();
  });

  test('says to download a model in Settings when nothing is on its way', async () => {
    const library = createLibrary();
    await openApp(library);
    act(() => {
      library.cancel('speech-a');
      library.cancel('extractor-a');
    });

    expect(pill()).toHaveTextContent('Download a voice model in Settings');
    expect(voiceFillButton()).not.toBeInTheDocument();
  });

  test('keeps saying how far the download is while it is paused offline', async () => {
    let online = true;
    const changed = new Set<() => void>();
    await openApp(
      createLibrary({
        connection: {
          isOnline: () => online,
          subscribe: listener => {
            changed.add(listener);
            return () => changed.delete(listener);
          },
        },
      })
    );
    await pass(500);

    act(() => {
      online = false;
      changed.forEach(listener => listener());
    });
    await pass(1000);

    // The download is still on its way, and the card says what it waits for.
    expect(pill()).toHaveTextContent('Model downloading 50%');
  });

  test('opens Settings at the Voice Fill card when tapped', async () => {
    await openApp(createLibrary());
    await screen.findByDisplayValue('Test Smoke');

    fireEvent.click(screen.getByRole('button', { name: 'Model downloading 0%' }));
    await pass(0);

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    const voiceFillCard = screen.getByTestId('settings-voice-fill-card');
    expect(within(voiceFillCard).getAllByText(/^Downloading 0%/)).toHaveLength(2);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(voiceFillCard);
  });

  test('Settings opened from the navigation bar is not scrolled to the card', async () => {
    await openApp(createLibrary(), 'settings');

    expect(card()).toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  test('the download goes on whichever screen is up', async () => {
    await openApp(createLibrary());
    fireEvent.click(await screen.findByTestId('voice-fill-pill'));

    await pass(500);

    expect(
      within(screen.getByTestId('voice-fill-model-speech')).getByText(/^Downloading 50%/)
    ).toBeInTheDocument();
  });

  test('picking a model writes nothing to the shared application settings', async () => {
    const library = createLibrary();
    const { backend } = await openApp(library, 'settings');
    const before = JSON.stringify(backend.store);

    act(() => library.remove('speech-a'));
    fireEvent.click(
      within(screen.getByTestId('voice-fill-model-speech')).getByRole('button', {
        name: 'Download Speech A',
      })
    );
    await pass(1000);

    expect(JSON.stringify(backend.store)).toBe(before);
    expect(window.localStorage.getItem('voiceFill.modelLibrary')).toContain('"ready"');
  });
});

describe('a phone that cannot run Voice Fill', () => {
  const capablePhone = (): PhoneEnvironment => ({
    crossOriginIsolated: true,
    navigator: {
      mediaDevices: { getUserMedia: () => Promise.resolve({}) },
      gpu: { requestAdapter: () => Promise.resolve({}) },
    },
  });

  beforeEach(() => {
    window.localStorage.clear();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  test('one that can has the pill, then the button, and the card', async () => {
    const phone = capablePhone();
    const first = await openApp(createLibrary({ capabilities: () => canRunVoiceFill(phone) }));
    await screen.findByDisplayValue('Test Smoke');

    expect(pill()).toBeInTheDocument();
    await pass(1000);
    expect(voiceFillButton()).toBeInTheDocument();

    first.unmount();
    await openApp(createLibrary({ capabilities: () => canRunVoiceFill(phone) }), 'settings');
    expect(card()).toBeInTheDocument();
  });

  test.each<[string, PhoneEnvironment]>([
    ['no microphone API', { ...capablePhone(), navigator: { gpu: capablePhone().navigator.gpu } }],
    [
      'no WebGPU adapter',
      {
        ...capablePhone(),
        navigator: {
          ...capablePhone().navigator,
          gpu: { requestAdapter: () => Promise.resolve(null) },
        },
      },
    ],
    ['a page that is not cross-origin isolated', { ...capablePhone(), crossOriginIsolated: false }],
  ])('with %s has no button, no pill and no settings card', async (_, phone) => {
    const first = await openApp(createLibrary({ capabilities: () => canRunVoiceFill(phone) }));
    await screen.findByDisplayValue('Test Smoke');
    await pass(1000);

    expect(voiceFillButton()).not.toBeInTheDocument();
    expect(pill()).not.toBeInTheDocument();

    first.unmount();
    await openApp(createLibrary({ capabilities: () => canRunVoiceFill(phone) }), 'settings');
    await pass(1000);

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(card()).not.toBeInTheDocument();
    // And nothing was downloaded for a feature the phone cannot run.
    expect(window.localStorage.getItem('voiceFill.modelLibrary')).toBeNull();
  });
});
