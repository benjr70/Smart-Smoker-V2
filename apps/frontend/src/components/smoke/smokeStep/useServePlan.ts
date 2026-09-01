/**
 * The Serve Plan of the cook on screen: whether the planner is switched on, the
 * plan as the backend judged it, and the two things a pitmaster does to one.
 *
 * The verdict is never worked out here. It is read off the timeline the smoke
 * step already polls — the backend decides it once, so this card, the
 * touchscreen and the push notification cannot disagree about whether dinner is
 * on time. What this hook owns is the writing: the two steppers, and the plan a
 * cook starts with.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CompletionEstimate,
  DEFAULT_SERVE_PLAN_SETTINGS,
  ServePlanStatus,
  ServePlanWrite,
  useApiClient,
  useApiSnackbar,
} from '../../../api';

/** How long after the meat is ready the seeded plan puts dinner. */
export const SEED_CUSHION_MINUTES = 30;

/** The quarter-hours a plan is made in; a seeded serve time is rounded up to one. */
export const PLAN_ROUNDING_MINUTES = 15;

const MINUTE_MS = 60_000;

export interface UseServePlanInput {
  /** The plan as the backend judged it, or `null` when this cook has none. */
  plan: ServePlanStatus | null;
  /** The cook's projection, which a first plan is seeded from. */
  estimate: CompletionEstimate | null;
  /** Ask for the cook — and with it the verdict — to be read again. */
  refresh: () => void;
}

export interface UseServePlanResult {
  /** Whether the planner is switched on at all. */
  enabled: boolean;
  /**
   * Move the moment the food hits the table. Resolves `true` when the plan was
   * stored, so a card showing the tap ahead of the backend knows whether to
   * keep showing it.
   */
  setServeAt: (serveAt: Date) => Promise<boolean>;
  /** Change how long the meat rests before it is carved, in minutes. */
  setRestMinutes: (restMinutes: number) => Promise<boolean>;
  /**
   * Start a plan for a cook that has none, on the pitmaster's say-so rather
   * than on an estimate: the same arithmetic the seed does, worked from now,
   * because now is the only moment a warming cook can be planned from.
   */
  createPlan: () => Promise<boolean>;
}

/**
 * The moment a seeded plan puts dinner: when the meat is ready, plus the rest
 * it still has to do, plus half an hour of cushion — rounded *up* to the next
 * quarter-hour.
 *
 * Up rather than to the nearest, because rounding down would hand the cook a
 * plan that is already tighter than the one the app just worked out for them.
 */
export const seededServeAt = (eta: Date, restMinutes: number): Date => {
  const target = eta.getTime() + (restMinutes + SEED_CUSHION_MINUTES) * MINUTE_MS;
  const step = PLAN_ROUNDING_MINUTES * MINUTE_MS;
  return new Date(Math.ceil(target / step) * step);
};

/**
 * A projection worth planning a dinner around: the cook is climbing and the
 * backend has said when it will be there.
 *
 * A warming cook, a stalled one and one off the heat all have no ETA to work
 * back from, and seeding a plan from a bluffed one would put dinner on the
 * table at a time nobody has any reason to believe.
 */
const realEta = (estimate: CompletionEstimate | null): Date | null =>
  estimate?.state === 'ok' ? estimate.eta : null;

export function useServePlan({ plan, estimate, refresh }: UseServePlanInput): UseServePlanResult {
  const client = useApiClient();
  const notify = useApiSnackbar();
  // Whether the planner is on, as the settings say — `null` until they have
  // been read. The difference matters to the seeding below: a plan is a write,
  // and writing one on the strength of a shipped default would plan a cook for
  // somebody who had switched the planner off.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const clientRef = useRef(client);
  clientRef.current = client;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  // Whether this screen has already seeded a plan. Seeding is a guess made on
  // the cook's behalf, and it is only ever made once *successfully*: the write
  // and the read that confirms it are a round trip apart, and a second poll
  // landing in between would otherwise seed a second plan over the first. A
  // seed that failed seeded nothing, so it is not one of those.
  const seeded = useRef(false);
  // The write in flight, if any. Every write is chained onto it, so the plan
  // stored last is the one tapped last however fast the taps come.
  const pending = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    void clientRef.current.servePlan
      .get()
      .then(settings => {
        if (active) {
          setEnabled(settings.enabled);
        }
      })
      // A settings read that failed says nothing about whether the planner is
      // on, so nothing is concluded from it: the card keeps whatever it had.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client]);

  const write = useCallback(
    (change: ServePlanWrite): Promise<boolean> => {
      // Queued behind whatever is already in flight, so two taps inside one
      // round trip are stored in the order they were tapped: unordered writes
      // of the same field mean the plan that ends up stored is whichever
      // request the network happened to deliver last.
      const stored = pending.current
        .catch(() => undefined)
        .then(() => clientRef.current.smoke.saveServePlan(change))
        // The verdict is the backend's, and the plan it judged is the one that
        // just changed: what is on screen is out of date the instant the write
        // lands, so the cook is read again rather than re-judged here.
        .then(() => {
          refresh();
          return true;
        })
        .catch(() => {
          notifyRef.current('Could not save the serve plan.');
          return false;
        });
      pending.current = stored;
      return stored;
    },
    [refresh]
  );

  /**
   * The rest this cook already has stored, in minutes — the value the
   * Post-Smoke rest field and the rest stepper are two views of.
   *
   * Read rather than assumed, because a cook can carry a rest with no serving
   * time beside it (the touchscreen writes either half on its own), and the
   * backend answers no plan at all until there is a serving time. Seeding as
   * though such a cook rested for nothing would put dinner a whole rest early
   * and have the backend calling an on-time cook late the moment it judged it.
   *
   * Rejects rather than guessing when the cook cannot be read: a seed made on a
   * guess is a plan the pitmaster has to notice and undo.
   */
  const readStoredRest = useCallback(async (): Promise<number> => {
    const session = await clientRef.current.state.get();
    if (!session?.smokeId) {
      throw new Error('no cook is set up to plan');
    }
    const smoke = await clientRef.current.smoke.getById(session.smokeId);
    return smoke.restMinutes ?? 0;
  }, []);

  const eta = realEta(estimate);

  useEffect(() => {
    if (enabled !== true || plan !== null || eta === null || seeded.current) {
      return;
    }
    // Claimed before the read and the write, so a poll landing mid-round-trip
    // does not seed a second plan over the first — and released again if the
    // seed never happened, so a dropped request costs one poll rather than the
    // whole cook's plan.
    seeded.current = true;
    void readStoredRest()
      .then(rest => write({ serveAt: seededServeAt(eta, rest) }))
      .catch(() => false)
      .then(stored => {
        if (!stored) {
          seeded.current = false;
        }
      });
  }, [enabled, plan, eta, write, readStoredRest]);

  const createPlan = useCallback(async (): Promise<boolean> => {
    try {
      const rest = await readStoredRest();
      // The seed's own arithmetic, from now: a cook with no trustworthy
      // estimate has no other moment to work back from, and this one was asked
      // for rather than guessed on the cook's behalf.
      return await write({ serveAt: seededServeAt(new Date(), rest) });
    } catch {
      notifyRef.current('Could not save the serve plan.');
      return false;
    }
  }, [readStoredRest, write]);

  return {
    // Before the settings have been read the shipped answer is given, so the
    // card of a cook that has a plan is not withheld for a round trip; nothing
    // is *written* on that assumption.
    enabled: enabled ?? DEFAULT_SERVE_PLAN_SETTINGS.enabled,
    setServeAt: useCallback((serveAt: Date) => write({ serveAt }), [write]),
    setRestMinutes: useCallback((restMinutes: number) => write({ restMinutes }), [write]),
    createPlan,
  };
}
