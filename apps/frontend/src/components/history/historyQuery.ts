/**
 * What the history list is narrowed by, and what comes out of narrowing it.
 *
 * The screen holds the search text and the chosen meat chips; this module owns
 * every decision that follows from them, so the screen renders an answer rather
 * than working one out.
 */

/** The parts of a session the search reads. */
export interface HistoryQuerySession {
  name: string;
  meatType: string;
  woodType: string;
  /**
   * The day the cook happened, as the archive carries it and the card shows it
   * ("Jul 4, 2026") — matched in that form, because the form the user has read
   * it in is the form they will type a fragment of.
   *
   * Optional, and tolerant of gaps, like the notes below it.
   */
  date?: string;
  /**
   * Everything written about the cook — the pre-smoke, smoke, post-smoke and
   * review notes — in no particular order, because the search treats them
   * alike. The history row carries them flattened; see `SmokeHistory`.
   *
   * Optional, and tolerant of gaps, so a row from a backend older than the
   * field is searched by its other fields rather than throwing the whole
   * screen away.
   */
  notes?: readonly (string | null | undefined)[];
}

/** What the user has narrowed the list by. */
export interface HistoryFilters {
  /** The search text, as typed. */
  query: string;
  /** The meat types chosen from the chips; empty means every meat. */
  meats: readonly string[];
}

export interface HistorySelection<Session extends HistoryQuerySession> {
  /** The sessions to render, in the order they were given. */
  shown: Session[];
  /**
   * Every meat in the whole list, once each, in the order they first appear —
   * the chips to offer.
   *
   * Derived from the whole list rather than from what is shown, so choosing a
   * chip cannot take the other chips away and strand the user in a filter they
   * can no longer widen.
   */
  meatTypes: string[];
  /**
   * The chosen meats that are still in the list — what the chips should show as
   * pressed, and what actually narrowed `shown`.
   *
   * A choice can outlive the cooks it was made about: filter by pork, delete
   * the last pork cook, and the chip goes but the choice does not. Left alone
   * that choice hides every remaining cook behind a filter with no chip to
   * unpick it, so it is dropped here — the list widens back rather than
   * emptying for a reason nothing on the screen can explain.
   */
  meats: string[];
  /**
   * Whether the list is narrowed at all — the header counts "N of M" while it
   * is, and "M sessions" while it is not.
   */
  filtering: boolean;
  /**
   * Which of the two empty states to show, or `null` when there is a list to
   * show instead.
   *
   * `never-smoked` is a history with nothing in it — the user is told to finish
   * a cook. `no-matches` is a history narrowed to nothing — the user is offered
   * their filters back. They are told apart here rather than at the screen
   * because "nothing to show" means two different things and only the counts
   * know which.
   */
  emptyState: HistoryEmptyState | null;
}

/** The two ways the history list can have nothing to show. */
export type HistoryEmptyState = 'never-smoked' | 'no-matches';

/**
 * Whether a session answers to the search text, which it does when any one of
 * the fields it is searched by contains it.
 *
 * This is the one answer to "what is a cook findable by" in this app — the
 * history list and the compare picker both ask it here, because a cook the
 * picker can find and the list cannot is the same archive read two ways. A cook
 * is remembered by what it was called, what was in it, what it was smoked over,
 * when it happened and what was written about it.
 *
 * The comparison is lower-cased on both sides: nobody types "Hickory" with the
 * capital when they are looking for a cook.
 */
export const matchesQuery = (session: HistoryQuerySession, query: string): boolean =>
  [session.name, session.meatType, session.woodType, session.date, ...(session.notes ?? [])].some(
    field => typeof field === 'string' && field.toLowerCase().includes(query)
  );

/**
 * Which empty state, if either, the two counts describe. An empty history wins
 * over an empty result: filters over nothing are still filters over nothing.
 */
const emptyStateFor = (total: number, showing: number): HistoryEmptyState | null => {
  if (total === 0) {
    return 'never-smoked';
  }
  return showing === 0 ? 'no-matches' : null;
};

/** The sessions left after the search text and the chosen meats are applied. */
export function selectHistory<Session extends HistoryQuerySession>(
  sessions: readonly Session[],
  filters: HistoryFilters
): HistorySelection<Session> {
  const query = filters.query.trim().toLowerCase();

  const meatTypes = sessions
    .map(session => session.meatType)
    .filter((meat, index, meats) => meat !== '' && meats.indexOf(meat) === index);

  // Only the meats there is still a chip for can narrow the list; see `meats`
  // on the selection for why a stale one is dropped rather than honoured.
  const meats = filters.meats.filter(meat => meatTypes.includes(meat));

  const shown = sessions.filter(
    session =>
      // No chip chosen is "every meat", not "no meat": the chips narrow the
      // list, and a list narrowed by nothing is the whole list.
      (meats.length === 0 || meats.includes(session.meatType)) && matchesQuery(session, query)
  );

  return {
    shown,
    meatTypes,
    meats,
    filtering: query !== '' || meats.length > 0,
    emptyState: emptyStateFor(sessions.length, shown.length),
  };
}
