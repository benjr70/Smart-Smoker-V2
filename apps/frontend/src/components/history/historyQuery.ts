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
   * Everything written about the cook — the pre-smoke, smoke, post-smoke and
   * review notes — in no particular order, because the search treats them
   * alike.
   *
   * Optional, and tolerant of gaps, because the history list is read from a
   * payload that carries no notes today: a session without them is searched by
   * its other fields rather than being excluded, and the field starts matching
   * the day the list carries notes without this module changing.
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
 * The comparison is lower-cased on both sides: nobody types "Hickory" with the
 * capital when they are looking for a cook.
 */
const matches = (session: HistoryQuerySession, query: string): boolean =>
  [session.name, session.meatType, session.woodType, ...(session.notes ?? [])].some(
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

  const shown = sessions.filter(
    session =>
      // No chip chosen is "every meat", not "no meat": the chips narrow the
      // list, and a list narrowed by nothing is the whole list.
      (filters.meats.length === 0 || filters.meats.includes(session.meatType)) &&
      matches(session, query)
  );

  const meatTypes = sessions
    .map(session => session.meatType)
    .filter((meat, index, meats) => meat !== '' && meats.indexOf(meat) === index);

  return {
    shown,
    meatTypes,
    filtering: query !== '' || filters.meats.length > 0,
    emptyState: emptyStateFor(sessions.length, shown.length),
  };
}
