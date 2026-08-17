/**
 * What this user's own past cooks say the meat on the smoker climbs at.
 *
 * Pure, over plain records: which cooks count and what they imply is the whole
 * of this module's judgement, and it is made here rather than anywhere that also
 * has to talk to a database.
 */

/** A finished cook, as much of one as the rate is read from. */
export interface CompletedCook {
  /** What was cooked, as the user typed it into the pre-smoke form. */
  meatType?: string | null;
  /** What it weighed, in `weightUnit`. */
  weight?: number | null;
  weightUnit?: string | null;
  /** How long the cook ran. */
  durationMs?: number | null;
  /** What the cook was taken to, °F. */
  targetTemp?: number | null;
  /** The first meat reading of the cook, °F — where the climb started. */
  startTemp?: number | null;
}

/** The cook being estimated, as far as matching past ones needs it. */
export interface CurrentCook {
  meatType?: string | null;
  weight?: number | null;
  weightUnit?: string | null;
}

const HOUR_MS = 60 * 60 * 1000;

/** The middle of a set of numbers, averaging the two middles of an even set. */
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * How many past cooks of the meat it takes before their middle is worth
 * predicting from. One cook is an anecdote — one bad probe placement or one
 * afternoon of wind — and a prediction from it would carry the authority of a
 * measurement.
 */
const MIN_COOKS = 2;

/**
 * Whether two free-text meat descriptions name the same thing.
 *
 * Case- and space-insensitive, and forgiving of a couple of typed characters,
 * so "brisket", "Brisket " and "brisket" spelt wrong once all group together.
 * Nothing wider than that: containment would group "Pork" with "Pork Shoulder",
 * which are different cuts that cook at different rates, and an alias table
 * would be a second opinion about meat kept in two places.
 */
const isSameMeat = (
  meat: string | null | undefined,
  other: string | null | undefined,
): boolean => {
  const left = (meat ?? '').trim().toLowerCase();
  const right = (other ?? '').trim().toLowerCase();
  if (left === '' || right === '') {
    return false;
  }
  return editDistance(left, right) <= MEAT_MATCH_DISTANCE;
};

/** How many typed characters apart two meat descriptions may be. */
export const MEAT_MATCH_DISTANCE = 2;

/**
 * The Levenshtein distance between two words: how many single-character
 * insertions, deletions or substitutions turn one into the other.
 */
const editDistance = (left: string, right: string): number => {
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= right.length; j += 1) {
      row[j] = Math.min(
        previous[j] + 1,
        row[j - 1] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous = row;
  }
  return previous[right.length];
};

/**
 * What a logged weight is in pounds, or `null` when it cannot be read.
 *
 * Only the three units the pre-smoke form offers are understood, and anything
 * else is refused rather than guessed at: a weight read in the wrong unit is
 * worse than no weight, because normalizing by it would quietly scale every
 * prediction by 2.2 while looking like a measurement.
 */
const pounds = (
  weight: number | null | undefined,
  unit: string | null | undefined,
): number | null => {
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) {
    return null;
  }
  switch ((unit ?? '').trim().toLowerCase()) {
    case 'lb':
    case 'lbs':
      return weight;
    case 'oz':
      return weight / 16;
    case 'kg':
      return weight * 2.205;
    default:
      return null;
  }
};

/** How fast a finished cook climbed, °F/hr, or `null` when it cannot say. */
const rateOf = (cook: CompletedCook): number | null => {
  const climb = (cook.targetTemp ?? NaN) - (cook.startTemp ?? NaN);
  const rate = climb / ((cook.durationMs ?? NaN) / HOUR_MS);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
};

/**
 * What a piece of meat like the one on the smoker climbs at, °F/hr, or `null`
 * when the user's history cannot say.
 *
 * Weight-normalized by the square root of the weight, because a cook's length
 * grows with roughly the square root of its mass: a 16lb brisket does not take
 * twice as long as an 8lb one, and treating rates as weight-free would have a
 * packer brisket predicting a pork tenderloin.
 */
export function sampleHistoricalRate(
  cooks: CompletedCook[],
  current: CurrentCook,
): number | null {
  const sameMeat = cooks.filter((cook) =>
    isSameMeat(cook.meatType, current.meatType),
  );
  const rates = sameMeat.map((cook) => ({
    cook,
    rate: rateOf(cook),
  }));
  const currentWeight = pounds(current.weight, current.weightUnit);
  const normalized = rates
    .map(
      ({ cook, rate }) =>
        (rate ?? NaN) * Math.sqrt(pounds(cook.weight, cook.weightUnit) ?? NaN),
    )
    .filter((rate) => Number.isFinite(rate));
  if (currentWeight !== null && normalized.length >= MIN_COOKS) {
    return median(normalized) / Math.sqrt(currentWeight);
  }
  // Weights are missing, unreadable, or the meat on the smoker was never
  // weighed: the same-meat cooks still say something about how this meat
  // cooks, just without the correction for how big it is. Un-normalized is a
  // rougher answer than the one above and a far better one than none.
  const plain = rates
    .map(({ rate }) => rate)
    .filter((rate): rate is number => rate !== null);
  return plain.length >= MIN_COOKS ? median(plain) : null;
}
