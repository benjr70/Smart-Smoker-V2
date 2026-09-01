/**
 * What the two cooks did the same way, and what only one of them did.
 *
 * Pure, and separate from the card that draws it, because deciding what counts
 * as "the same step" — "Trim fat cap" in one cook and "trim fat cap " in the
 * other is one step, not two — is the substance of the diff, and is worth
 * stating once and testing directly.
 */

/** A pair of step lists split three ways: shared first, then each cook's own. */
export interface StepDiff {
  /** Steps both cooks did, in the order — and as often as — cook A wrote them. */
  both: string[];
  /** Steps only cook A did, in A's order. */
  onlyA: string[];
  /** Steps only cook B did, in B's order. */
  onlyB: string[];
}

/**
 * How a step is matched: trimmed and case-folded, so the same instruction
 * typed on two different days still reads as one step. Only the comparison is
 * normalised — each cook's step is shown as that cook wrote it.
 */
const normalise = (step: string): string => step.trim().toLowerCase();

/**
 * The steps a cook actually wrote down.
 *
 * Blanks are dropped — an empty row in the step editor is a row nobody filled
 * in, not a step one cook did and the other skipped. A step written twice is
 * kept twice: a cook that logged two spritzes did two things, and the diff
 * reports a cook's list as that cook recorded it rather than editing its
 * history down on the way to the screen. A record old enough to hold no step
 * list at all is read the same way as one whose list is empty: as no steps.
 */
const written = (steps: string[] | undefined): string[] =>
  (steps ?? []).filter(step => step.trim() !== '');

export const diffSteps = (aSteps: string[] | undefined, bSteps: string[] | undefined): StepDiff => {
  const a = written(aSteps);
  const b = written(bSteps);
  const inA = new Set(a.map(normalise));
  const inB = new Set(b.map(normalise));

  return {
    both: a.filter(step => inB.has(normalise(step))),
    onlyA: a.filter(step => !inB.has(normalise(step))),
    onlyB: b.filter(step => !inA.has(normalise(step))),
  };
};
