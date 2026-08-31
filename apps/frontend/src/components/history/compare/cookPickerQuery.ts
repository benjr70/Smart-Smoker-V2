/**
 * What the cook picker offers, out of everything ever cooked.
 *
 * The picker's whole reason to exist is that a pitmaster does not remember the
 * name of the cook they want — they remember that it was pork, on cherry, some
 * time in July. So the narrowing is one search across the four things a cook is
 * remembered by, plus the meat chips, plus the order to hand the survivors back
 * in; and all of it lives here rather than in the sheet, so the sheet renders an
 * answer instead of working one out.
 *
 * The meat chips are the history list's, delegated rather than restated: which
 * meats there are chips for, and what happens to a chip whose last cook has been
 * deleted, is one decision this app has already made once.
 */
import { SmokeHistory } from '../../../api/types';
import { selectHistory } from '../historyQuery';

/** The three orders the picker offers, in the order it offers them. */
export type CookSort = 'recent' | 'rated' | 'name';

/** What the user has narrowed the archive by. */
export interface CookPickerFilters {
  /** The search text, as typed. */
  query: string;
  /** The meats chosen from the chips; empty means every meat. */
  meats: readonly string[];
  /** Which order to offer the survivors in. */
  sort: CookSort;
}

export interface CookPickerSelection {
  /** The cooks to offer, in the chosen order. */
  shown: SmokeHistory[];
  /** How many cooks the archive holds in all — the "of M" in the header. */
  total: number;
  /** Every meat in the archive, once each — one chip apiece. */
  meatTypes: string[];
  /** The chosen meats that are still in the archive; what the chips show as pressed. */
  meats: string[];
}

/**
 * How a cook is remembered: what it was called, what was in it, what it was
 * smoked over, and when it happened.
 *
 * The date is matched as the string the archive carries and the card shows
 * ("Jul 4, 2026"), because the form the user has read it in is the form they
 * will type a fragment of.
 */
const remembered = (cook: SmokeHistory): string[] => [
  cook.name,
  cook.meatType,
  cook.woodType,
  cook.date,
];

const matches = (cook: SmokeHistory, needle: string): boolean =>
  needle === '' ||
  remembered(cook).some(field => typeof field === 'string' && field.toLowerCase().includes(needle));

/** A cook's overall taste as a number; a cook nobody rated scores nothing. */
const score = (cook: SmokeHistory): number => {
  const rated = parseFloat(cook.overAllRating);
  return Number.isFinite(rated) ? rated : 0;
};

/**
 * The cooks in the chosen order.
 *
 * "Recent" is the order they arrive in — the history read hands them over
 * newest-first, and the date a cook carries is a label written for a human
 * rather than something to parse an ordering out of. The other two sorts are
 * stable on top of it, so cooks that tie on rating stay in date order.
 */
const inOrder = (cooks: SmokeHistory[], sort: CookSort): SmokeHistory[] => {
  if (sort === 'rated') {
    return [...cooks].sort((one, other) => score(other) - score(one));
  }
  if (sort === 'name') {
    return [...cooks].sort((one, other) => {
      // A cook nobody named has no place in an alphabet: it goes to the end,
      // not to the top where an empty name would sort it.
      if (one.name === '' || other.name === '') {
        return one.name === '' ? (other.name === '' ? 0 : 1) : -1;
      }
      return one.name.localeCompare(other.name, undefined, { sensitivity: 'base' });
    });
  }
  return [...cooks];
};

export function selectPickerCooks(
  cooks: readonly SmokeHistory[],
  filters: CookPickerFilters
): CookPickerSelection {
  // The chips first, by the history list's own rules — including dropping a
  // choice the archive no longer has a cook for.
  const {
    shown: byMeat,
    meatTypes,
    meats,
  } = selectHistory(cooks, { query: '', meats: filters.meats });

  const needle = filters.query.trim().toLowerCase();

  return {
    shown: inOrder(
      byMeat.filter(one => matches(one, needle)),
      filters.sort
    ),
    total: cooks.length,
    meatTypes,
    meats,
  };
}
