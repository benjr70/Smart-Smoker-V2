/**
 * What the cook picker offers, out of everything ever cooked.
 *
 * The picker's whole reason to exist is that a pitmaster does not remember the
 * name of the cook they want — they remember that it was pork, on cherry, some
 * time in July. So the narrowing is one search across the things a cook is
 * remembered by, plus the meat chips, plus the order to hand the survivors back
 * in; and all of it lives here rather than in the sheet, so the sheet renders an
 * answer instead of working one out.
 *
 * The search and the meat chips are the history list's, delegated rather than
 * restated: what a cook is findable by, which meats there are chips for, and
 * what happens to a chip whose last cook has been deleted, are decisions this
 * app has already made once. The order is the only thing the picker adds.
 */
import { SmokeHistory } from '../../../api/types';
import { selectHistory } from '../historyQuery';
import { sortableScore } from './cookRating';

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
 * The cooks in the chosen order.
 *
 * "Recent" is the order they arrive in — the history read hands them over
 * newest-first, and the date a cook carries is a label written for a human
 * rather than something to parse an ordering out of. The other two sorts are
 * stable on top of it, so cooks that tie on rating stay in date order.
 */
const inOrder = (cooks: SmokeHistory[], sort: CookSort): SmokeHistory[] => {
  if (sort === 'rated') {
    // Unrated by the same rule the rows and the verdict read a rating by, and
    // below every score there is: a cook nobody rated has not come last in
    // "Top rated", it was never in the order at all.
    return [...cooks].sort(
      (one, other) => sortableScore(other.overAllRating) - sortableScore(one.overAllRating)
    );
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
  // The search and the chips are the history list's own — what a cook is
  // findable by is one decision this app has already made, and a picker that
  // made it a second time would drift from the list it is picking out of. All
  // the picker adds is the order.
  const { shown, meatTypes, meats } = selectHistory(cooks, {
    query: filters.query,
    meats: filters.meats,
  });

  return {
    shown: inOrder(shown, filters.sort),
    total: cooks.length,
    meatTypes,
    meats,
  };
}
