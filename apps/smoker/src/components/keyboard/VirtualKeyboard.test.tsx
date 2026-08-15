/**
 * The keyboard wrapper contract: the wifi screen (slice 10) will consume only
 * these events — character, backspace, layer — so these tests exercise the
 * wrapper strictly through what an operator sees (key caps) and what the
 * consumer receives (callbacks). Nothing here names the underlying library;
 * the implementation behind the wrapper must be swappable without touching
 * this suite.
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { VirtualKeyboard } from './VirtualKeyboard';

const renderKeyboard = () => {
  const onCharacter = jest.fn();
  const onBackspace = jest.fn();
  const onLayerChange = jest.fn();
  render(
    <VirtualKeyboard
      onCharacter={onCharacter}
      onBackspace={onBackspace}
      onLayerChange={onLayerChange}
    />
  );
  return { onCharacter, onBackspace, onLayerChange };
};

/** Tap the key whose cap reads `label`, exactly as a thumb would. */
const tap = (label: string) => fireEvent.click(screen.getByText(label));

describe('typing letters', () => {
  it('emits the tapped letter as a character', () => {
    const { onCharacter } = renderKeyboard();

    tap('q');

    expect(onCharacter).toHaveBeenCalledWith('q');
  });
});

describe('shift', () => {
  it('capitalizes: after tapping shift, the same key emits the capital', () => {
    const { onCharacter, onLayerChange } = renderKeyboard();

    tap('⇧');
    tap('Q');

    expect(onCharacter).toHaveBeenCalledWith('Q');
    expect(onLayerChange).toHaveBeenCalledWith('upper');
  });

  it('toggles back: a second shift returns to lowercase', () => {
    const { onCharacter, onLayerChange } = renderKeyboard();

    tap('⇧');
    tap('⇧');
    tap('q');

    expect(onCharacter).toHaveBeenCalledWith('q');
    expect(onLayerChange).toHaveBeenLastCalledWith('lower');
  });
});

describe('the symbols layer', () => {
  it('opens from ?123, types symbols, and ABC returns to letters', () => {
    const { onCharacter, onLayerChange } = renderKeyboard();

    tap('?123');
    expect(onLayerChange).toHaveBeenLastCalledWith('symbols');

    tap('@');
    tap('#');
    tap('?');
    expect(onCharacter.mock.calls.map(call => call[0])).toEqual(['@', '#', '?']);

    tap('ABC');
    expect(onLayerChange).toHaveBeenLastCalledWith('lower');
    tap('q');
    expect(onCharacter).toHaveBeenLastCalledWith('q');
  });
});

describe('the digit row', () => {
  const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  it('is visible and typeable on the letters, shifted and symbols layers', () => {
    const { onCharacter } = renderKeyboard();

    // Letters layer.
    DIGITS.forEach(digit => expect(screen.getByText(digit)).toBeInTheDocument());
    tap('7');
    expect(onCharacter).toHaveBeenLastCalledWith('7');

    // Shifted layer.
    tap('⇧');
    DIGITS.forEach(digit => expect(screen.getByText(digit)).toBeInTheDocument());
    tap('8');
    expect(onCharacter).toHaveBeenLastCalledWith('8');

    // Symbols layer.
    tap('?123');
    DIGITS.forEach(digit => expect(screen.getByText(digit)).toBeInTheDocument());
    tap('9');
    expect(onCharacter).toHaveBeenLastCalledWith('9');
  });
});

describe('backspace and space', () => {
  it('backspace emits a delete event, never a character', () => {
    const { onCharacter, onBackspace } = renderKeyboard();

    tap('⌫');

    expect(onBackspace).toHaveBeenCalledTimes(1);
    expect(onCharacter).not.toHaveBeenCalled();
  });

  it('space emits a plain space character', () => {
    const { onCharacter } = renderKeyboard();

    tap('space');

    expect(onCharacter).toHaveBeenCalledWith(' ');
  });
});
