/**
 * The demo harness: the wrapper wired to a text field the way the wifi screen
 * (slice 10) will wire it. One journey types a plausible wifi password and
 * proves every contract event does real work — letters, shift capitals,
 * symbols, the always-there digit row, and backspace undoing a mistake.
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { KeyboardDemo } from './KeyboardDemo';

const tap = (label: string) => fireEvent.click(screen.getByText(label));

const typedValue = (): HTMLInputElement => screen.getByLabelText('Typed text') as HTMLInputElement;

describe('typing a wifi password on the demo harness', () => {
  it('assembles capitals, letters, digits, symbols and backspace into the field', () => {
    render(<KeyboardDemo />);

    // A capital: shift up, letter, shift back down.
    tap('⇧');
    tap('P');
    tap('⇧');
    tap('a');
    expect(typedValue().value).toBe('Pa');

    // The digit row without leaving the letters layer.
    tap('5');
    expect(typedValue().value).toBe('Pa5');

    // A symbol from the symbols layer, then back to letters.
    tap('?123');
    tap('@');
    tap('ABC');
    tap('x');
    expect(typedValue().value).toBe('Pa5@x');

    // A typo, erased.
    tap('⌫');
    expect(typedValue().value).toBe('Pa5@');
  });
});
