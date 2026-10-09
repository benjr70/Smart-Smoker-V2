import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { useModelLibrary } from './ModelLibraryProvider';
import { MODEL_LIBRARY_STORAGE_KEY, pairReadiness } from './modelLibrary';
import {
  SCRIPTED_MODEL_LIBRARY_STORAGE_KEY,
  VoiceFillModels,
  scriptedModelsAreOn,
  scriptedPhoneIsCapable,
} from './scriptedModels';
import type { VoiceFillPorts } from './VoiceFillPortsProvider';
import { useVoiceFillPorts } from './VoiceFillPortsProvider';

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

/** Says whether a screen under the root would be offered Voice Fill. */
function Offered(): JSX.Element {
  return <span>{useVoiceFillPorts() ? 'offered' : 'not offered'}</span>;
}

/** Says what the Model library under the root lists, if there is one. */
function Listed(): JSX.Element {
  const models = useModelLibrary();
  return (
    <span data-testid="listed">
      {models
        ? models.library.registry.models.map(model => model.name).join(', ')
        : 'no Model library'}
    </span>
  );
}

/** Says which pair the Model library under the root has picked. */
function Picked(): JSX.Element {
  const models = useModelLibrary();
  return (
    <span data-testid="picked">
      {models ? `${models.state.picked.speech}, ${models.state.picked.extractor}` : 'no pair'}
    </span>
  );
}

/** Says whether the Model library under the root found the phone able to run Voice Fill. */
function Supported(): JSX.Element {
  const models = useModelLibrary();
  return <span data-testid="supported">{String(models?.state.supported)}</span>;
}

/** Lets the Model library the root opens finish checking the phone. */
const opened = async (): Promise<void> => {
  await act(async () => {
    for (let turn = 0; turn < 10; turn += 1) {
      await Promise.resolve();
    }
  });
};

const builtWith = (value: string | undefined): void => {
  if (value === undefined) {
    delete process.env.REACT_APP_VOICE_FILL_SCRIPTED;
  } else {
    process.env.REACT_APP_VOICE_FILL_SCRIPTED = value;
  }
};

const openedAt = (search: string): void => {
  window.history.replaceState(null, '', `/${search}`);
};

describe('the scripted Voice Fill models', () => {
  beforeEach(() => phoneIs('nothing'));
  afterEach(() => {
    builtWith(undefined);
    openedAt('');
    window.localStorage.clear();
    phoneIsAsFound();
  });

  test('are on only in a build that allows them, on a page that asks for them', () => {
    builtWith('true');
    expect(scriptedModelsAreOn('?voiceFill=scripted')).toBe(true);
    expect(scriptedModelsAreOn('?other=1&voiceFill=scripted')).toBe(true);
    expect(scriptedModelsAreOn('')).toBe(false);
    expect(scriptedModelsAreOn('?voiceFill=real')).toBe(false);
  });

  test('cannot be asked for in a build that does not allow them', () => {
    builtWith(undefined);
    expect(scriptedModelsAreOn('?voiceFill=scripted')).toBe(false);
    builtWith('false');
    expect(scriptedModelsAreOn('?voiceFill=scripted')).toBe(false);
  });

  test('are handed to the screens under the root when on', async () => {
    builtWith('true');
    openedAt('?voiceFill=scripted');

    render(
      <VoiceFillModels>
        <Offered />
      </VoiceFillModels>
    );
    await opened();

    expect(screen.getByText('offered')).toBeInTheDocument();
  });

  test('come with a Model library that lists them, two to a role', async () => {
    builtWith('true');
    openedAt('?voiceFill=scripted');

    render(
      <VoiceFillModels>
        <Listed />
      </VoiceFillModels>
    );
    await opened();

    expect(screen.getByTestId('listed')).toHaveTextContent(
      'Scripted speech, Scripted speech B, Scripted extractor, Scripted extractor B, Moonshine Small Streaming, Gemma 4 E2B'
    );
  });

  test('stay the pair a fresh phone gets, with the real extraction model there to be picked', async () => {
    builtWith('true');
    openedAt('?voiceFill=scripted');
    phoneIs('nothing');

    render(
      <VoiceFillModels>
        <Picked />
      </VoiceFillModels>
    );
    await opened();

    expect(screen.getByTestId('picked')).toHaveTextContent('scripted-speech, scripted-extractor');
  });

  test('keep their Model library’s record apart from the one a real library keeps', async () => {
    builtWith('true');
    openedAt('?voiceFill=scripted');

    render(
      <VoiceFillModels>
        <Listed />
      </VoiceFillModels>
    );
    await opened();

    expect(window.localStorage.getItem(SCRIPTED_MODEL_LIBRARY_STORAGE_KEY)).toContain(
      'scripted-speech'
    );
    expect(window.localStorage.getItem(MODEL_LIBRARY_STORAGE_KEY)).toBeNull();
  });

  test.each<['microphone' | 'adapter' | 'isolation']>([['microphone'], ['adapter'], ['isolation']])(
    'come with a Model library that checks the phone: with no %s it cannot run Voice Fill',
    async missing => {
      builtWith('true');
      openedAt('?voiceFill=scripted');
      phoneIs(missing);

      render(
        <VoiceFillModels>
          <Supported />
        </VoiceFillModels>
      );
      await opened();

      expect(screen.getByTestId('supported')).toHaveTextContent('false');
      // And nothing is downloaded or recorded for what the phone cannot run.
      expect(window.localStorage.getItem(SCRIPTED_MODEL_LIBRARY_STORAGE_KEY)).toBeNull();
    }
  );

  test('find a phone that has all three able to run Voice Fill', async () => {
    builtWith('true');
    openedAt('?voiceFill=scripted');

    render(
      <VoiceFillModels>
        <Supported />
      </VoiceFillModels>
    );
    await opened();

    expect(screen.getByTestId('supported')).toHaveTextContent('true');
  });

  test('take the phone as able without checking only where the run says so', async () => {
    expect(scriptedPhoneIsCapable('?voiceFill=scripted&voiceFillPhone=capable')).toBe(true);
    expect(scriptedPhoneIsCapable('?voiceFill=scripted')).toBe(false);
    expect(scriptedPhoneIsCapable('?voiceFillPhone=checked')).toBe(false);

    builtWith('true');
    openedAt('?voiceFill=scripted&voiceFillPhone=capable');
    phoneIsAsFound();

    render(
      <VoiceFillModels>
        <Supported />
      </VoiceFillModels>
    );
    await opened();

    expect(screen.getByTestId('supported')).toHaveTextContent('true');
  });
});

describe('the real Voice Fill models, where the scripted ones are off', () => {
  /** Says whether the picked pair can take a Ramble. */
  function Readiness(): JSX.Element {
    const models = useModelLibrary();
    return (
      <span data-testid="readiness">
        {models ? pairReadiness(models.library.registry, models.state).state : 'no Model library'}
      </span>
    );
  }

  /** Hands the test the ports a screen under the root is given. */
  let ports: VoiceFillPorts | null = null;
  function Ports(): null {
    ports = useVoiceFillPorts();
    return null;
  }

  beforeEach(() => {
    ports = null;
    phoneIs('nothing');
  });
  afterEach(() => {
    builtWith(undefined);
    openedAt('');
    window.localStorage.clear();
    phoneIsAsFound();
  });

  test.each<[string, string | undefined, string]>([
    ['a production build', undefined, ''],
    ['a production build asked for the scripted models', undefined, '?voiceFill=scripted'],
    ['a build that allows the scripted models, on a page that did not ask', 'true', ''],
  ])('are handed to the screens in %s: the speech model alone', async (_, built, search) => {
    builtWith(built);
    openedAt(search);

    render(
      <VoiceFillModels>
        <Offered />
        <Listed />
        <Supported />
      </VoiceFillModels>
    );
    await opened();

    expect(screen.getByText('offered')).toBeInTheDocument();
    expect(screen.getByTestId('listed')).toHaveTextContent(/^Moonshine Small Streaming$/);
    expect(screen.getByTestId('supported')).toHaveTextContent('true');
  });

  test('download the speech model the first time the app is opened, and are ready with it', async () => {
    jest.useFakeTimers();
    try {
      render(
        <VoiceFillModels>
          <Readiness />
        </VoiceFillModels>
      );
      await opened();

      expect(screen.getByTestId('readiness')).toHaveTextContent('downloading');
      expect(window.localStorage.getItem(MODEL_LIBRARY_STORAGE_KEY)).toContain(
        'moonshine-small-streaming'
      );
      // Not under the key a scripted run keeps its record under.
      expect(window.localStorage.getItem(SCRIPTED_MODEL_LIBRARY_STORAGE_KEY)).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(5000);
        for (let turn = 0; turn < 20; turn += 1) {
          await Promise.resolve();
        }
      });

      // With no extraction model registered, the speech model is the whole pair.
      expect(screen.getByTestId('readiness')).toHaveTextContent('ready');
    } finally {
      jest.useRealTimers();
    }
  });

  test('have no extraction model: a Ramble cannot be read, and that is a failure, not a hang', async () => {
    render(
      <VoiceFillModels>
        <Ports />
      </VoiceFillModels>
    );
    await opened();

    await expect(ports?.extractor.load()).rejects.toThrow('No extraction model');
    await expect(
      ports?.extractor.extract('preSmoke', 'Sixteen pound brisket.', { now: new Date() })
    ).rejects.toThrow('not loaded');
    await expect(ports?.extractor.unload()).resolves.toBeUndefined();
  });

  test.each<['microphone' | 'adapter' | 'isolation']>([['microphone'], ['adapter'], ['isolation']])(
    'check the phone: with no %s it cannot run Voice Fill, and nothing is downloaded',
    async missing => {
      phoneIs(missing);

      render(
        <VoiceFillModels>
          <Supported />
        </VoiceFillModels>
      );
      await opened();

      expect(screen.getByTestId('supported')).toHaveTextContent('false');
      expect(window.localStorage.getItem(MODEL_LIBRARY_STORAGE_KEY)).toBeNull();
      expect(window.localStorage.getItem('voiceFill.fakeDownloads')).toBeNull();
    }
  );

  test('are not taken as able to run on the word of the page’s address', async () => {
    openedAt('?voiceFillPhone=capable');
    phoneIsAsFound();

    render(
      <VoiceFillModels>
        <Supported />
      </VoiceFillModels>
    );
    await opened();

    expect(screen.getByTestId('supported')).toHaveTextContent('false');
  });
});
