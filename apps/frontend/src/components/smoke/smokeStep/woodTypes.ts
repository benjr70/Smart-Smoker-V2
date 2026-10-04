/**
 * The woods the picker offers, in the design's order. Mesquite joins the five
 * the app has always listed — it is one of the four or five woods anyone
 * actually smokes on, and its absence was an omission rather than a decision.
 *
 * The list is a set of suggestions, not the permitted values: the picker is
 * free-text, so a cook on grapevine or whisky-barrel oak is recorded the same
 * way as one on hickory.
 *
 * In a module of its own, apart from the screen that shows it, because Voice
 * Fill matches a spoken wood against the same list and must not pull a React
 * component in to read it.
 */
export const WOOD_TYPES: readonly string[] = [
  'Hickory',
  'Post Oak',
  'Pecan',
  'Cherry',
  'Apple',
  'Mesquite',
];
