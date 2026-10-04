import { render, screen } from '@testing-library/react';
import React from 'react';
import { VoiceFillModels, scriptedModelsAreOn } from './scriptedModels';
import { useVoiceFillPorts } from './VoiceFillPortsProvider';

/** Says whether a screen under the root would be offered Voice Fill. */
function Offered(): JSX.Element {
  return <span>{useVoiceFillPorts() ? 'offered' : 'not offered'}</span>;
}

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

  test('are handed to the screens under the root when on', () => {
    builtWith('true');
    openedAt('?voiceFill=scripted');

    render(
      <VoiceFillModels>
        <Offered />
      </VoiceFillModels>
    );

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
});
