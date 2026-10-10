import '@testing-library/jest-dom';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { DesignSurface, appTheme } from '../theme';
import { createFakeDownloader } from './fakeDownloader';
import type { ModelLibraryOptions } from './modelLibrary';
import { createModelLibrary } from './modelLibrary';
import { ModelLibraryProvider } from './ModelLibraryProvider';
import { createModelRegistry } from './modelRegistry';
import { VoiceFillSettingsCard } from './VoiceFillSettingsCard';

const MB = 1_000_000;

const registry = createModelRegistry([
  { id: 'speech-a', role: 'speech', name: 'Speech A', sizeBytes: 158 * MB },
  { id: 'speech-b', role: 'speech', name: 'Speech B', sizeBytes: 200 * MB },
  { id: 'extractor-a', role: 'extractor', name: 'Extractor A', sizeBytes: 1900 * MB },
  { id: 'extractor-b', role: 'extractor', name: 'Extractor B', sizeBytes: 500 * MB },
]);

/** A connection the test switches off and on. */
const createConnection = () => {
  let online = true;
  const listeners = new Set<() => void>();
  return {
    isOnline: () => online,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next: boolean) => {
      online = next;
      listeners.forEach(listener => listener());
    },
  };
};

/** Lets `ms` of downloading go by, and what it finishes land. */
const pass = async (ms: number): Promise<void> => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    for (let turn = 0; turn < 20; turn += 1) {
      await Promise.resolve();
    }
  });
};

interface Phone extends Partial<ModelLibraryOptions> {
  failingTestLoad?: readonly string[];
}

/**
 * The settings card as the application mounts it, over the phone's own storage.
 *
 * Nothing here provides an API client: the card has no way to reach the
 * application settings the backend shares between devices, so everything it
 * shows and keeps is on the phone.
 */
const openSettings = async ({ failingTestLoad, ...options }: Phone = {}) => {
  const library = createModelLibrary({
    registry,
    // What has arrived is kept on the phone, as the record of it is.
    downloader: createFakeDownloader({
      storage: window.localStorage,
      chunkMs: 100,
      chunks: 10,
      failingTestLoad,
    }),
    storage: window.localStorage,
    capabilities: () => Promise.resolve(true),
    ...options,
  });
  const view = render(
    <CssVarsProvider theme={appTheme}>
      <DesignSurface>
        <ModelLibraryProvider library={library}>
          <VoiceFillSettingsCard />
        </ModelLibraryProvider>
      </DesignSurface>
    </CssVarsProvider>
  );
  await pass(0);
  return { library, ...view };
};

const speech = () => within(screen.getByTestId('voice-fill-model-speech'));
const extractor = () => within(screen.getByTestId('voice-fill-model-extractor'));

/** Opens a dropdown and gives its options. */
const optionsOf = (label: string): HTMLElement[] => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: label }));
  return within(screen.getByRole('listbox')).getAllByRole('option');
};

describe('the Voice Fill settings card', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  test('picking a model starts its download, and its status line follows it to Ready', async () => {
    await openSettings();

    const options = optionsOf('Speech-to-text model');
    expect(options.map(option => option.textContent)).toEqual(['Speech A', 'Speech B']);
    fireEvent.click(options[1]);

    expect(screen.getByRole('combobox', { name: 'Speech-to-text model' })).toHaveTextContent(
      'Speech B'
    );
    expect(speech().getByText('Downloading 0% · 0 MB of 200 MB')).toBeInTheDocument();

    await pass(400);

    expect(speech().getByText('Downloading 40% · 80 MB of 200 MB')).toBeInTheDocument();
    // The status is announced, politely, to someone who cannot see it change.
    expect(speech().getByRole('status')).toHaveTextContent('Downloading 40% · 80 MB of 200 MB');
    expect(speech().getByRole('progressbar', { name: 'Speech B download' })).toHaveAttribute(
      'aria-valuenow',
      '40'
    );
    expect(speech().getByRole('button', { name: 'Cancel Speech B' })).toBeInTheDocument();

    await pass(600);

    expect(speech().getByText('Ready to use · 200 MB on phone')).toBeInTheDocument();
    expect(speech().getByRole('button', { name: 'Remove Speech B' })).toBeInTheDocument();
    expect(speech().queryByRole('progressbar')).not.toBeInTheDocument();
  });

  test('on first open both of the default pair are downloading', async () => {
    await openSettings();

    expect(screen.getByRole('heading', { level: 2, name: 'Voice fill' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Speech-to-text model' })).toHaveTextContent(
      'Speech A'
    );
    expect(screen.getByRole('combobox', { name: 'Field extraction model' })).toHaveTextContent(
      'Extractor A'
    );
    // Two dropdowns and nothing else to set: no switch, no checkbox.
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    await pass(500);

    expect(speech().getByText('Downloading 50% · 79 MB of 158 MB')).toBeInTheDocument();
    expect(extractor().getByText('Downloading 50% · 950 MB of 1.9 GB')).toBeInTheDocument();
  });

  test('the dropdowns tick the models that are downloaded', async () => {
    await openSettings();
    await pass(1000);

    const options = optionsOf('Speech-to-text model');

    expect(within(options[0]).getByRole('img', { name: 'downloaded' })).toBeInTheDocument();
    expect(within(options[1]).queryByRole('img', { name: 'downloaded' })).not.toBeInTheDocument();
  });

  test('a model that fails its test-load reads “Didn’t work on this phone”, with Remove', async () => {
    await openSettings({ failingTestLoad: ['speech-a'] });

    await pass(1000);

    expect(speech().getByText('Didn’t work on this phone')).toBeInTheDocument();
    expect(speech().queryByText(/Ready to use/)).not.toBeInTheDocument();
    expect(extractor().getByText('Ready to use · 1.9 GB on phone')).toBeInTheDocument();
    // It is on the phone all the same, taking its storage: ticked as downloaded.
    expect(
      within(optionsOf('Speech-to-text model')[0]).getByRole('img', { name: 'downloaded' })
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });

    fireEvent.click(speech().getByRole('button', { name: 'Remove Speech A' }));

    expect(speech().getByText('Not downloaded · 158 MB')).toBeInTheDocument();
  });

  test('a download reloaded part-way goes on from where it was', async () => {
    const first = await openSettings();
    await pass(300);
    expect(speech().getByText('Downloading 30% · 47 MB of 158 MB')).toBeInTheDocument();

    // The page is reloaded: everything in memory goes, the phone's storage stays.
    first.unmount();
    await pass(5000);
    await openSettings();

    expect(speech().getByText('Downloading 30% · 47 MB of 158 MB')).toBeInTheDocument();

    await pass(200);
    expect(speech().getByText('Downloading 50% · 79 MB of 158 MB')).toBeInTheDocument();

    await pass(500);
    expect(speech().getByText('Ready to use · 158 MB on phone')).toBeInTheDocument();
    expect(extractor().getByText('Ready to use · 1.9 GB on phone')).toBeInTheDocument();
  });

  test('the pick survives a reload', async () => {
    const first = await openSettings();
    fireEvent.click(optionsOf('Field extraction model')[1]);
    first.unmount();

    await openSettings();

    expect(screen.getByRole('combobox', { name: 'Field extraction model' })).toHaveTextContent(
      'Extractor B'
    );
  });

  test('Cancel stops a download, and Download starts it again', async () => {
    await openSettings();
    await pass(300);

    fireEvent.click(speech().getByRole('button', { name: 'Cancel Speech A' }));

    expect(speech().getByText('Not downloaded · 158 MB')).toBeInTheDocument();
    await pass(1000);
    expect(speech().getByText('Not downloaded · 158 MB')).toBeInTheDocument();

    fireEvent.click(speech().getByRole('button', { name: 'Download Speech A' }));
    await pass(100);

    expect(speech().getByText('Downloading 10% · 16 MB of 158 MB')).toBeInTheDocument();
  });

  test('Remove returns a ready model to not downloaded', async () => {
    await openSettings();
    await pass(1000);

    fireEvent.click(speech().getByRole('button', { name: 'Remove Speech A' }));

    expect(speech().getByText('Not downloaded · 158 MB')).toBeInTheDocument();
    expect(speech().getByRole('button', { name: 'Download Speech A' })).toBeInTheDocument();
    expect(extractor().getByText('Ready to use · 1.9 GB on phone')).toBeInTheDocument();
  });

  test('offline shows paused, and the download goes on when the phone is back', async () => {
    const connection = createConnection();
    await openSettings({ connection });
    await pass(300);

    act(() => connection.set(false));
    await pass(1000);

    expect(speech().getByText('Paused, waiting for Wi-Fi · 47 MB of 158 MB')).toBeInTheDocument();
    expect(speech().getByRole('progressbar', { name: 'Speech A download' })).toHaveAttribute(
      'aria-valuenow',
      '30'
    );
    expect(speech().getByRole('button', { name: 'Cancel Speech A' })).toBeInTheDocument();

    act(() => connection.set(true));
    await pass(100);

    expect(speech().getByText('Downloading 40% · 63 MB of 158 MB')).toBeInTheDocument();
  });

  test('a download that breaks while online shows paused with what had arrived, and goes on', async () => {
    const kept = createFakeDownloader({ storage: window.localStorage, chunkMs: 100, chunks: 10 });
    let broken = false;
    await openSettings({
      retryDelayMs: 1000,
      downloader: {
        ...kept,
        download: (model, options) => {
          if (model.role !== 'speech' || broken) {
            return kept.download(model, options);
          }
          broken = true;
          const inner = new AbortController();
          kept.download(model, { ...options, signal: inner.signal }).catch(() => undefined);
          return new Promise<void>((resolve, reject) => {
            setTimeout(() => {
              inner.abort();
              reject(new Error('server error'));
            }, 350);
          });
        },
      },
    });

    await pass(400);

    expect(speech().getByText('Paused, waiting for Wi-Fi · 47 MB of 158 MB')).toBeInTheDocument();
    expect(speech().getByRole('button', { name: 'Cancel Speech A' })).toBeInTheDocument();

    await pass(1100);

    expect(speech().getByText('Downloading 40% · 63 MB of 158 MB')).toBeInTheDocument();
  });

  test('is absent on a phone that cannot run Voice Fill', async () => {
    await openSettings({ capabilities: () => Promise.resolve(false) });

    expect(screen.queryByTestId('settings-voice-fill-card')).not.toBeInTheDocument();
    expect(screen.queryByText('Voice fill')).not.toBeInTheDocument();
  });

  test('shows the speech dropdown alone while there is no extraction model to pick', async () => {
    await openSettings({
      registry: createModelRegistry([
        { id: 'speech-a', role: 'speech', name: 'Speech A', sizeBytes: 158 * MB },
      ]),
    });

    expect(screen.getByTestId('settings-voice-fill-card')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Speech-to-text model' })).toHaveTextContent(
      'Speech A'
    );
    // No empty dropdown stands in for the role that has no model.
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.queryByTestId('voice-fill-model-extractor')).not.toBeInTheDocument();
    expect(screen.queryByText('Field extraction model')).not.toBeInTheDocument();

    await pass(1000);

    expect(speech().getByText('Ready to use · 158 MB on phone')).toBeInTheDocument();
  });

  test('is absent where there is no model of either kind to pick', async () => {
    await openSettings({ registry: createModelRegistry([]) });

    expect(screen.queryByTestId('settings-voice-fill-card')).not.toBeInTheDocument();
  });

  test('is absent where the application provides no Model library', () => {
    render(<VoiceFillSettingsCard />);

    expect(screen.queryByTestId('settings-voice-fill-card')).not.toBeInTheDocument();
  });
});
