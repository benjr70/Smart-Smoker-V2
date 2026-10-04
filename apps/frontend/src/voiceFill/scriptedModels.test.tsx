import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { useModelLibrary } from './ModelLibraryProvider';
import { MODEL_LIBRARY_STORAGE_KEY } from './modelLibrary';
import {
  SCRIPTED_MODEL_LIBRARY_STORAGE_KEY,
  VoiceFillModels,
  scriptedModelsAreOn,
} from './scriptedModels';
import { useVoiceFillPorts } from './VoiceFillPortsProvider';

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

/** Lets the Model library the root opens finish checking the phone. */
const opened = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
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
  afterEach(() => {
    builtWith(undefined);
    openedAt('');
    window.localStorage.clear();
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
      'Scripted speech, Scripted speech B, Scripted extractor, Scripted extractor B'
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
