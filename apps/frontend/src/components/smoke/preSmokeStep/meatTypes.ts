/**
 * The cuts the picker offers, exactly as the design lists them and in its order.
 *
 * Suggestions, not permitted values: the picker is free-text, so a cook on a
 * cut nobody listed is recorded the same way as a brisket. The three the app
 * used to offer left almost every common cook typing its own — the same
 * omission the wood picker had before the smoke step's slice. "Other" is the
 * design's own last entry, and it behaves like the rest of them: it is a string
 * the field can hold, and a pitmaster who means something more specific types it
 * over.
 *
 * In a module of its own, apart from the screen that shows it, because Voice
 * Fill matches a spoken cut against the same list and must not pull a React
 * component in to read it.
 */
export const MEAT_TYPES: readonly string[] = [
  'Brisket',
  'Ribs',
  'Pork Shoulder',
  'Turkey',
  'Chicken',
  'Chuck Roast',
  'Other',
];
