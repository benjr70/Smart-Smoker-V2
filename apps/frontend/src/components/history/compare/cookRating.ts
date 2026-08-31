/**
 * What a cook scored, as the comparison reads it — and what a cook nobody
 * scored is.
 *
 * There is one rule here because there is one question: three places on the
 * compare screen ask whether a cook was rated — the picker's rows, the picker's
 * "Top rated" order and the verdict — and a cook that is unrated on one of them
 * and a genuine 0.0 on another is the same cook read two different ways.
 *
 * A zero is unrated rather than the worst cook ever made: every slider on the
 * ratings screen starts at zero, and a cook archived without ever opening that
 * screen reads back as zeros it was never given.
 */

/** A cook's overall taste, or `null` for one nobody scored. */
export const ratedScore = (value: number | string | null | undefined): number | null => {
  const score = typeof value === 'string' ? parseFloat(value) : value;
  return typeof score === 'number' && Number.isFinite(score) && score > 0 ? score : null;
};

/**
 * A cook's score as something to sort on, with the unrated last.
 *
 * Below every score there is, since a rated cook scores above zero: "Top rated"
 * is an order over the cooks that were rated, and one that was not has not come
 * bottom of it — it was never in it.
 */
export const UNRATED_ORDER = -1;

export const sortableScore = (value: number | string | null | undefined): number =>
  ratedScore(value) ?? UNRATED_ORDER;
