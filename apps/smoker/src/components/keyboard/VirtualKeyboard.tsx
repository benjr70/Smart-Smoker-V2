/**
 * The wifi keyboard behind a contract the wifi screen can stay ignorant of.
 *
 * Consumers receive exactly three things: a character was typed, a character
 * was deleted, the layer changed. Which library paints the keys — currently
 * react-simple-keyboard with the layout in ./layouts — is this file's private
 * business, so it can be swapped without touching the wifi screen or the
 * contract tests. See DECISION.md for why this library.
 */
import React, { useState } from 'react';
import Keyboard from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css';
import {
  BACKSPACE_KEY,
  KEY_DISPLAY,
  KEYBOARD_LAYOUT,
  KeyboardLayer,
  LETTERS_KEY,
  SHIFT_KEY,
  SPACE_KEY,
  SYMBOLS_KEY,
} from './layouts';

export type { KeyboardLayer } from './layouts';

export interface VirtualKeyboardProps {
  /** A printable character was typed — letters, digits, symbols, and space. */
  onCharacter: (character: string) => void;
  /** The backspace key was tapped. */
  onBackspace: () => void;
  /** The visible layer changed (shift toggles lower/upper, ?123 ⇄ ABC). */
  onLayerChange?: (layer: KeyboardLayer) => void;
}

export function VirtualKeyboard(props: VirtualKeyboardProps): JSX.Element {
  const { onCharacter, onBackspace, onLayerChange } = props;
  const [layer, setLayer] = useState<KeyboardLayer>('lower');

  const changeLayer = (next: KeyboardLayer) => {
    setLayer(next);
    onLayerChange?.(next);
  };

  const handleKeyPress = (key: string) => {
    switch (key) {
      case SHIFT_KEY:
        changeLayer(layer === 'upper' ? 'lower' : 'upper');
        break;
      case SYMBOLS_KEY:
        changeLayer('symbols');
        break;
      case LETTERS_KEY:
        changeLayer('lower');
        break;
      case BACKSPACE_KEY:
        onBackspace();
        break;
      case SPACE_KEY:
        onCharacter(' ');
        break;
      default:
        onCharacter(key);
    }
  };

  return (
    <Keyboard
      layout={KEYBOARD_LAYOUT}
      layoutName={layer}
      display={KEY_DISPLAY}
      mergeDisplay
      onKeyPress={handleKeyPress}
    />
  );
}
