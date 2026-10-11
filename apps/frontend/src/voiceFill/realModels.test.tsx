import '@testing-library/jest-dom';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import { act, render, screen, within } from '@testing-library/react';
import React from 'react';
import { DesignSurface, appTheme } from '../theme';
import { GEMMA_FILE } from './gemmaModel';
import { MODEL_LIBRARY_STORAGE_KEY } from './modelLibrary';
import { useModelLibrary } from './ModelLibraryProvider';
import type { ExtractorPort } from './ports';
import { createRealModelLibrary, createRealPorts } from './realModels';
import { SCRIPTED_MODEL_LIBRARY_STORAGE_KEY, VoiceFillModels } from './scriptedModels';
import { useVoiceFillPorts } from './VoiceFillPortsProvider';
import { VoiceFillSettingsCard } from './VoiceFillSettingsCard';

/**
 * The adapter's chunk, which needs the real runtime and a GPU: here it fetches
 * nothing, and says what it was asked for.
 */
const mockAdapter = {
  download: jest.fn(),
  testLoad: jest.fn(),
  createExtractor: jest.fn(),
};
jest.mock('./liteRtAdapter', () => mockAdapter);

// The real speech model's files are not fetched here: its downloader is stood
// in for by the scripted one, which keeps what has "arrived" on the phone.
jest.mock('./moonshineModel', () => {
  const { createFakeDownloader } = jest.requireActual('./fakeDownloader');
  return {
    ...jest.requireActual('./moonshineModel'),
    createMoonshineDownloader: () => createFakeDownloader({ storage: globalThis.localStorage }),
  };
});

/** What the capability check reads of the browser, and the test sets. */
const PHONE_PARTS: [object, string][] = [
  [window, 'crossOriginIsolated'],
  [window.navigator, 'mediaDevices'],
  [window.navigator, 'gpu'],
];

/** Makes the browser one that can run Voice Fill. */
const phoneIsCapable = (): void => {
  const parts = [
    true,
    { getUserMedia: () => Promise.resolve({}) },
    { requestAdapter: () => Promise.resolve({}) },
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

/** Says whether a screen under the root would be offered Voice Fill. */
function Offered(): JSX.Element {
  return <span>{useVoiceFillPorts() ? 'offered' : 'not offered'}</span>;
}

/** Says what the Model library under the root lists and has picked. */
function Library(): JSX.Element {
  const models = useModelLibrary();
  return (
    <>
      <span data-testid="listed">
        {models
          ? models.library.registry.models.map(model => model.name).join(', ')
          : 'no Model library'}
      </span>
      <span data-testid="picked">
        {models ? `${models.state.picked.speech}, ${models.state.picked.extractor}` : 'no pair'}
      </span>
      <span data-testid="supported">{String(models?.state.supported)}</span>
    </>
  );
}

/** Lets the Model library the root opens check the phone, and what follows land. */
const opened = async (): Promise<void> => {
  await act(async () => {
    for (let turn = 0; turn < 30; turn += 1) {
      await Promise.resolve();
    }
  });
};

/** The application root of a build that allows no scripted models: a production one. */
const openApp = async (children: React.ReactNode): Promise<void> => {
  render(
    <CssVarsProvider theme={appTheme}>
      <DesignSurface>
        <VoiceFillModels>{children}</VoiceFillModels>
      </DesignSurface>
    </CssVarsProvider>
  );
  await opened();
};

const extractor = () => within(screen.getByTestId('voice-fill-model-extractor'));

describe('the Voice Fill models of a production build', () => {
  /** Lets the download the test holds open end. */
  let arrive: () => void;

  beforeEach(() => {
    delete process.env.REACT_APP_VOICE_FILL_SCRIPTED;
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
    phoneIsCapable();
    mockAdapter.download.mockReset().mockImplementation(
      (_file: unknown, _store: unknown, options: { onProgress: (received: number) => void }) =>
        new Promise<void>(resolve => {
          options.onProgress(GEMMA_FILE.size / 4);
          arrive = resolve;
        })
    );
    mockAdapter.testLoad.mockReset().mockResolvedValue(true);
    mockAdapter.createExtractor.mockReset();
  });
  afterEach(() => {
    window.localStorage.clear();
    phoneIsAsFound();
  });

  test('come with a Model library of the registered models: Gemma 4 E2B is the extraction model a fresh phone gets, beside the speech model', async () => {
    await openApp(<Library />);

    expect(screen.getByTestId('listed')).toHaveTextContent(
      /^Moonshine Small Streaming, Gemma 4 E2B$/
    );
    expect(screen.getByTestId('picked')).toHaveTextContent(
      'moonshine-small-streaming, gemma-4-e2b-litert'
    );
    expect(screen.getByTestId('supported')).toHaveTextContent('true');
  });

  test('list Gemma 4 E2B in the extraction dropdown of the settings card, with its size', async () => {
    await openApp(<VoiceFillSettingsCard />);

    expect(screen.getByRole('combobox', { name: 'Field extraction model' })).toHaveTextContent(
      'Gemma 4 E2B'
    );
    expect(extractor().getByRole('status')).toHaveTextContent('of 2.0 GB');
    // Beside the speech model's dropdown: one for each role.
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.getByRole('combobox', { name: 'Speech-to-text model' })).toHaveTextContent(
      'Moonshine Small Streaming'
    );
  });

  test('fetch Gemma’s file through the real downloader, with progress on the status line, then prove it', async () => {
    await openApp(<VoiceFillSettingsCard />);

    expect(mockAdapter.download).toHaveBeenCalledTimes(1);
    expect(mockAdapter.download.mock.calls[0][0]).toBe(GEMMA_FILE);
    expect(extractor().getByText('Downloading 25% · 502 MB of 2.0 GB')).toBeInTheDocument();

    arrive();
    await opened();

    expect(mockAdapter.testLoad).toHaveBeenCalledTimes(1);
    expect(extractor().getByText('Ready to use · 2.0 GB on phone')).toBeInTheDocument();
  });

  test('keep their Model library’s record where a real library keeps it', async () => {
    await openApp(<Library />);

    expect(window.localStorage.getItem(MODEL_LIBRARY_STORAGE_KEY)).toContain('gemma-4-e2b-litert');
    expect(window.localStorage.getItem(SCRIPTED_MODEL_LIBRARY_STORAGE_KEY)).toBeNull();
  });

  test('are the ones a build that allows the scripted models hands a page that did not ask for them', async () => {
    process.env.REACT_APP_VOICE_FILL_SCRIPTED = 'true';

    await openApp(<Library />);

    expect(screen.getByTestId('listed')).toHaveTextContent(
      /^Moonshine Small Streaming, Gemma 4 E2B$/
    );
  });

  test('show nothing, and fetch nothing, on a phone that cannot run Voice Fill', async () => {
    phoneIsAsFound();

    await openApp(
      <>
        <Library />
        <VoiceFillSettingsCard />
      </>
    );

    expect(screen.getByTestId('supported')).toHaveTextContent('false');
    expect(screen.queryByTestId('settings-voice-fill-card')).not.toBeInTheDocument();
    expect(mockAdapter.download).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(MODEL_LIBRARY_STORAGE_KEY)).toBeNull();
  });

  test('offer the screens Voice Fill: there is a speech model to hear a Ramble and an extraction model to read it', async () => {
    await openApp(<Offered />);

    expect(screen.getByText('offered')).toBeInTheDocument();
  });

  test('read a Ramble with the picked extraction model', async () => {
    const gemma: ExtractorPort = {
      load: jest.fn(() => Promise.resolve()),
      extract: jest.fn(() => Promise.resolve({ meatType: 'brisket' })),
      unload: jest.fn(() => Promise.resolve()),
    };
    mockAdapter.createExtractor.mockReturnValue(gemma);

    const ports = createRealPorts(createRealModelLibrary());
    await ports.extractor.load();

    expect(mockAdapter.createExtractor.mock.calls[0][0]).toBe(GEMMA_FILE);
    await expect(
      ports.extractor.extract('preSmoke', 'Brisket.', { now: new Date(2026, 9, 9, 12, 0) })
    ).resolves.toEqual({ meatType: 'brisket' });
  });
});
