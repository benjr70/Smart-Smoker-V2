/**
 * The wifi keyboard's three layers, as the design mock lays them out.
 *
 * Every layer keeps the digit row on top — a wifi password mixes digits into
 * anything, and hiding them behind a layer switch doubles the taps for the
 * most common non-letter characters. The lower/upper layers are the mock's
 * qwerty rows (the home row sits indented by half a key, shift and backspace
 * anchor the bottom letter row), and the symbols layer carries every printable
 * ASCII symbol so any real wifi password can be typed on-device.
 */

/** The layers a keyboard consumer can observe. */
export type KeyboardLayer = 'lower' | 'upper' | 'symbols';

/** Action keys, distinct from anything a key could ever type. */
export const SHIFT_KEY = '{shift}';
export const BACKSPACE_KEY = '{bksp}';
export const SPACE_KEY = '{space}';
export const SYMBOLS_KEY = '{symbols}';
export const LETTERS_KEY = '{abc}';

const DIGIT_ROW = '1 2 3 4 5 6 7 8 9 0';

/** Row layout per layer, in the underlying library's row-string format. */
export const KEYBOARD_LAYOUT: Record<KeyboardLayer, string[]> = {
  lower: [
    DIGIT_ROW,
    'q w e r t y u i o p',
    'a s d f g h j k l',
    `${SHIFT_KEY} z x c v b n m ${BACKSPACE_KEY}`,
    `${SYMBOLS_KEY} ${SPACE_KEY}`,
  ],
  upper: [
    DIGIT_ROW,
    'Q W E R T Y U I O P',
    'A S D F G H J K L',
    `${SHIFT_KEY} Z X C V B N M ${BACKSPACE_KEY}`,
    `${SYMBOLS_KEY} ${SPACE_KEY}`,
  ],
  symbols: [
    DIGIT_ROW,
    '@ # $ % & * ( ) - _ +',
    `! ? / \\ : ; ' " = < >`,
    '[ ] { } , . ~ ` ^ | ' + BACKSPACE_KEY,
    `${LETTERS_KEY} ${SPACE_KEY}`,
  ],
};

/** What the action keys' caps read. */
export const KEY_DISPLAY: Record<string, string> = {
  [SHIFT_KEY]: '⇧',
  [BACKSPACE_KEY]: '⌫',
  [SPACE_KEY]: 'space',
  [SYMBOLS_KEY]: '?123',
  [LETTERS_KEY]: 'ABC',
};
