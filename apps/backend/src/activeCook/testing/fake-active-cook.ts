import { WithDocumentId } from '../../common/document-id';
import { Smoke, SmokeStatus } from '../../smoke/smoke.schema';
import {
  ActiveCook,
  ActiveCookTransitions,
  attachToCook,
  ChildAttachment,
  ClearedCook,
  CookChildKey,
  CookSnapshot,
  CookTransition,
  idleCook,
  isActive,
  StartedCook,
  ToggledCook,
} from '../active-cook';
import { State } from '../state.schema';

/**
 * The Active Cook as a test gives it: a snapshot value, standing behind the
 * same interface the real module does.
 *
 * This is the point of the interface. A module that only reads the current cook
 * used to be tested by mocking the stored state *and* the cook archive *and*
 * whatever walked between them — up to eleven providers per spec, every one of
 * them a chance to describe a store the real one could never be in. Here a test
 * says which cook is attached and nothing else, and a reader that goes looking
 * for the cook anywhere but through this interface has nothing to find.
 *
 * Test-only — excluded from coverage collection.
 */
export interface FakeActiveCook extends ActiveCookTransitions {
  /** Recording, so a spec can hold one request to one resolve. */
  resolve: jest.Mock<Promise<CookSnapshot>, []>;
  /**
   * The stored state of the cook this fake is pointed at. Recording, and
   * stubbable — a box that has never held a state document is a fact about the
   * store rather than a snapshot, so a spec about one stubs past this.
   */
  state: jest.Mock<Promise<(State & WithDocumentId) | null>, []>;
  /** Recording, so a spec can hold a write to one attach of one kind. */
  attach: jest.Mock<Promise<any>, [CookChildKey, ChildAttachment<any>]>;
  /** Recording, so a spec can hold a route to one transition. */
  start: jest.Mock<Promise<StartedCook<any>>, [ChildAttachment<any>['create']]>;
  toggle: jest.Mock<Promise<ToggledCook>, []>;
  pull: jest.Mock<Promise<CookTransition>, []>;
  finish: jest.Mock<Promise<CookTransition>, []>;
  autoStop: jest.Mock<Promise<CookTransition>, [Date, string]>;
  clear: jest.Mock<Promise<ClearedCook>, []>;
  /** Point it at a different cook, or at idle, after it was built. */
  pointAt(snapshot: CookSnapshot): void;
  /** The cook as it now stands — the links an attach has written included. */
  cook(): CookSnapshot;
}

/** A reader answering `snapshot`, or idle when none is given. */
export const fakeActiveCook = (
  snapshot: CookSnapshot = idleCook(),
): FakeActiveCook => {
  let current = snapshot;
  const pointAt = (next: CookSnapshot): void => {
    current = next;
  };
  return {
    resolve: jest.fn(async () => current),
    state: jest.fn(async () => storedState(current)),
    /**
     * The real rule, over the cook this fake is pointed at — a created link
     * lands on that cook, so a spec reads the attach back the way a route
     * would on its next request rather than by trusting a call assertion.
     */
    attach: jest.fn((key, attachment) =>
      attachToCook(current, key, attachment, async (cook, childId) => {
        pointAt(attachedCook({ ...cook.smoke, [key]: childId }, cook.smoking));
      }),
    ),
    /**
     * The transitions, over the cook this fake is pointed at.
     *
     * Each applies the one change its real counterpart applies and answers won
     * or lost by the same stage condition, so a spec of a route reads the cook
     * back the way the next request would. Nothing about *how* a transition is
     * made — the conditional writes, the races, what a stamp is computed from —
     * is modelled here; that is held by the Active Cook's own spec, against the
     * store.
     */
    start: jest.fn(async (createPreSmoke) => {
      if (isActive(current)) {
        return { won: false, cook: current, preSmoke: null };
      }
      const { result, childId } = await createPreSmoke();
      pointAt(
        attachedCook(
          {
            _id: 'started-cook',
            preSmokeId: childId,
            status: SmokeStatus.InProgress,
          },
          false,
        ),
      );
      return { won: true, cook: current, preSmoke: result };
    }),
    toggle: jest.fn(async () => {
      if (!isActive(current)) {
        return { won: false, cook: current, state: null };
      }
      const smoking = !current.smoking;
      pointAt(
        attachedCook(
          {
            ...current.smoke,
            ...(smoking && !current.smoke.startedAt
              ? { startedAt: new Date() }
              : {}),
          },
          smoking,
        ),
      );
      return { won: true, cook: current, state: storedState(current) };
    }),
    pull: jest.fn(async () => {
      if (!isActive(current) || current.smoke.pullAt) {
        return { won: false, cook: current };
      }
      pointAt(
        attachedCook({ ...current.smoke, pullAt: new Date() }, current.smoking),
      );
      return { won: true, cook: current };
    }),
    finish: jest.fn(async () => {
      if (!isActive(current) || current.smoke.status === SmokeStatus.Complete) {
        return { won: false, cook: current };
      }
      pointAt(
        attachedCook(
          {
            ...current.smoke,
            finishedAt: current.smoke.finishedAt ?? new Date(),
            status: SmokeStatus.Complete,
          },
          current.smoking,
        ),
      );
      return { won: true, cook: current };
    }),
    /**
     * The stop, with the one shape that matters to a caller of it: the cook is
     * stamped and the smoker is off, and the cook is still in progress and
     * still attached. Lost where a finish was already stamped, which is the
     * condition the real one wins or loses on.
     */
    autoStop: jest.fn<Promise<CookTransition>, [Date, string]>(async (at) => {
      if (!isActive(current)) {
        return { won: false, cook: current };
      }
      const won = !current.smoke.finishedAt;
      pointAt(
        attachedCook(
          { ...current.smoke, finishedAt: current.smoke.finishedAt ?? at },
          false,
        ),
      );
      return { won, cook: current };
    }),
    /**
     * The clear, as a caller of it reads one back: the smoker is attached to
     * nothing afterwards, and the cook it detached is the win. What becomes
     * of the discarded cook's log is held by the Active Cook's own spec,
     * against the store.
     */
    clear: jest.fn(async () => {
      const won = isActive(current);
      pointAt(idleCook(false));
      return { won, cook: current, state: storedState(current) };
    }),
    pointAt,
    cook: () => current,
  };
};

/** The id of the cook a snapshot carries, as the stored state names it. */
const smokeIdOf = (snapshot: CookSnapshot): string =>
  isActive(snapshot) ? snapshot.smokeId : '';

/**
 * The stored state for the cook this fake is pointed at — the document the
 * get-state, toggle and clear routes answer with.
 *
 * Derived from the snapshot rather than held beside it so the two cannot
 * disagree: a spec that points the fake at a lit cook and then reads the state
 * back through a route sees the cook it named, with no second thing to keep in
 * step.
 */
const storedState = (snapshot: CookSnapshot): State & WithDocumentId => ({
  _id: 'state-1',
  smokeId: smokeIdOf(snapshot),
  smoking: snapshot.smoking,
});

/**
 * A snapshot of the cook the smoker is attached to, built from a stored smoke
 * record — so a spec writes the cook it means rather than the shape of one.
 */
export const attachedCook = (
  smoke: (Partial<Smoke> & WithDocumentId) | Record<string, unknown>,
  smoking = true,
): ActiveCook => ({
  idle: false,
  smokeId: String((smoke as WithDocumentId)._id),
  smoke: smoke as Smoke & WithDocumentId,
  smoking,
});
