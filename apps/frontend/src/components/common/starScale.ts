/**
 * How a score out of ten reads as five stars.
 *
 * The application scores a cook out of ten and the design shows five stars, so
 * something has to halve the score. That is arithmetic, not decoration, which
 * is why it lives here rather than inside the component that draws the stars:
 * the rounding is what anyone would argue about, and it can be argued about
 * against this module without rendering anything.
 */

/** How one star is drawn. */
export type StarState = 'full' | 'half' | 'empty';

/** How many stars the design draws. */
const STARS = 5;

/**
 * The five stars a score fills, left to right.
 *
 * A star is full once the score has passed its middle and half once the score
 * has reached it at all — so nine out of ten is four and a half stars, not
 * five, and a score of nothing shows five empty stars rather than pretending to
 * a rating that was never given.
 */
export function starStates(value: number, max = 10): StarState[] {
  const scaled = Number.isFinite(value) && max > 0 ? (Math.max(value, 0) / max) * STARS : 0;

  return Array.from({ length: STARS }, (_unused, index) => {
    if (scaled >= index + 1) {
      return 'full';
    }
    return scaled > index ? 'half' : 'empty';
  });
}
