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
  /** Move the moment the food hits the table. */
  setServeAt: (serveAt: Date) => void;
  /** Change how long the meat rests before it is carved, in minutes. */
  setRestMinutes: (restMinutes: number) => void;
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
  // the cook's behalf, and it is only ever made once: the write and the read
  // that confirms it are a round trip apart, and a second poll landing in
  // between would otherwise seed a second plan over the first.
  const seeded = useRef(false);

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
    (change: ServePlanWrite): void => {
      void clientRef.current.smoke
        .saveServePlan(change)
        // The verdict is the backend's, and the plan it judged is the one that
        // just changed: what is on screen is out of date the instant the write
        // lands, so the cook is read again rather than re-judged here.
        .then(() => refresh())
        .catch(() => notifyRef.current('Could not save the serve plan.'));
    },
    [refresh]
  );

  const eta = realEta(estimate);

  useEffect(() => {
    if (enabled !== true || plan !== null || eta === null || seeded.current) {
      return;
    }
    seeded.current = true;
    // No plan means no stored rest to read either, so the seed is the ETA plus
    // the cushion; the rest is left alone rather than invented, and the rest
    // stepper writes one the moment the pitmaster wants one.
    write({ serveAt: seededServeAt(eta, 0) });
  }, [enabled, plan, eta, write]);

  return {
    // Before the settings have been read the shipped answer is given, so the
    // card of a cook that has a plan is not withheld for a round trip; nothing
    // is *written* on that assumption.
    enabled: enabled ?? DEFAULT_SERVE_PLAN_SETTINGS.enabled,
    setServeAt: useCallback((serveAt: Date) => write({ serveAt }), [write]),
    setRestMinutes: useCallback((restMinutes: number) => write({ restMinutes }), [write]),
  };
}
