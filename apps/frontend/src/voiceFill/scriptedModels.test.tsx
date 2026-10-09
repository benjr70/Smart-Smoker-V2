import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { useModelLibrary } from './ModelLibraryProvider';
import { MODEL_LIBRARY_STORAGE_KEY } from './modelLibrary';
import {
  SCRIPTED_MODEL_LIBRARY_STORAGE_KEY,
  VoiceFillModels,
  scriptedModelsAreOn,
  scriptedPhoneIsCapable,
} from './scriptedModels';
import { useVoiceFillPorts } from './VoiceFillPortsProvider';

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

  test('leave the screens with no Voice Fill when off', () => {
    builtWith('true');
    openedAt('');

    render(
      <VoiceFillModels>
        <Offered />
      </VoiceFillModels>
    );

    expect(screen.getByText('not offered')).toBeInTheDocument();
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
      'Scripted speech, Scripted speech B, Scripted extractor, Scripted extractor B, Moonshine Small Streaming'
    );
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

  test('leave the screens with no Model library when off', () => {
    builtWith('true');
    openedAt('');

    render(
      <VoiceFillModels>
        <Listed />
      </VoiceFillModels>
    );

    expect(screen.getByTestId('listed')).toHaveTextContent('no Model library');
  });
});
