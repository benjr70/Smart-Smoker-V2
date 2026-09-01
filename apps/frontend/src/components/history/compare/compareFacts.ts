/**
 * The eight facts about a cook the comparison puts side by side, and which of
 * them the two cooks share.
 *
 * Pure, and separate from the table that draws it, because deciding what a cook
 * *is* — where each fact is read from, how it is written, and what counts as
 * "the same in both" — is the part worth stating once and testing directly.
 *
 * Each fact is read from where the record actually holds it: the meat and its
 * weight from the pre-smoke, the wood from the smoke profile, the timing and
 * extremes from the derived timeline, the rest from the post-smoke. A cook too
 * old for a piece — one logged before the timeline was derived — has an absence
 * there, not a zero, and it is written as such.
 */
import { CompareCook } from '../../../api';
import { NOT_RECORDED, formatCookDuration, formatRestTime } from '../../common/timeFormat';

/** One row of the facts table: what it is, what each cook did, and whether both did the same. */
export interface CompareFact {
  label: string;
  a: string;
  b: string;
  /**
   * Whether both cooks share this fact. Two absences are not a shared fact —
   * an em-dash on both sides says the record is silent, not that the cooks
   * matched — so only a recorded value counts as the same.
   */
  same: boolean;
}

/** A temperature as this table writes one, or an em-dash where none was derived. */
const formatTemp = (reading: number | null | undefined): string =>
  reading === null || reading === undefined || !Number.isFinite(reading)
    ? NOT_RECORDED
    : `${Math.round(reading)}°F`;

/** Anything written down, or an em-dash for a blank the record never held. */
const written = (value: string | undefined): string => value?.trim() || NOT_RECORDED;

/**
 * The wood a cook burned, and how long it rested, as this table writes them.
 *
 * Exported because the two method sections lead with these same two figures:
 * the pre-smoke diff is headed by the wood and the post-smoke diff by the rest,
 * and a figure written one way in the table and another above the diff would
 * read as two different facts about the same cook.
 */
export const woodOf = (cook: CompareCook): string => written(cook.smokeProfile.woodType);
export const restOf = (cook: CompareCook): string => formatRestTime(cook.postSmoke.restTime);

/** The cut as it was weighed, unit and all, or an em-dash for a cook nobody weighed. */
const formatWeight = (cook: CompareCook): string => {
  const { weight, unit } = cook.preSmoke.weight;
  if (weight === undefined) return NOT_RECORDED;
  return `${weight} ${unit ?? ''}`.trim();
};

export const compareFacts = (a: CompareCook, b: CompareCook): CompareFact[] => {
  const facts: { label: string; of: (cook: CompareCook) => string }[] = [
    { label: 'Meat', of: cook => written(cook.preSmoke.meatType) },
    { label: 'Weight', of: formatWeight },
    { label: 'Wood', of: woodOf },
    { label: 'Duration', of: cook => formatCookDuration(cook.timeline?.durationMs ?? null) },
    { label: 'Target', of: cook => formatTemp(cook.timeline?.targetTemp) },
    { label: 'Peak chamber', of: cook => formatTemp(cook.timeline?.peakChamber) },
    { label: 'Peak probe', of: cook => formatTemp(cook.timeline?.peakMeat) },
    { label: 'Rest', of: restOf },
  ];

  return facts.map(fact => {
    const valueA = fact.of(a);
    const valueB = fact.of(b);
    return {
      label: fact.label,
      a: valueA,
      b: valueB,
      same: valueA === valueB && valueA !== NOT_RECORDED,
    };
  });
};
