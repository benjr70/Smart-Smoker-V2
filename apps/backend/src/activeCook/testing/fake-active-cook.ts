import { WithDocumentId } from '../../common/document-id';
import { Smoke, SmokeStatus } from '../../smoke/smoke.schema';
import {
  ActiveCook,
  ActiveCookTransitions,
  attachToCook,
  ChildAttachment,
  CookChildKey,
  CookSnapshot,
  CookTransition,
  idleCook,
  isActive,
  StartedCook,
  ToggledCook,
} from '../active-cook';

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
  /** Recording, so a spec can hold a write to one attach of one kind. */
  attach: jest.Mock<Promise<any>, [CookChildKey, ChildAttachment<any>]>;
  /** Recording, so a spec can hold a route to one transition. */
  start: jest.Mock<Promise<StartedCook<any>>, [ChildAttachment<any>['create']]>;
  toggle: jest.Mock<Promise<ToggledCook>, []>;
  pull: jest.Mock<Promise<CookTransition>, []>;
  finish: jest.Mock<Promise<CookTransition>, []>;
  autoStop: jest.Mock<Promise<CookTransition>, [Date, string]>;
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
      return {
        won: true,
        cook: current,
        state: { _id: 'state-1', smokeId: smokeIdOf(current), smoking },
      };
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
    autoStop: jest.fn(async (at: Date, _notice: string) => {
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
    pointAt,
    cook: () => current,
  };
};

/** The id of the cook a snapshot carries, as the stored state names it. */
const smokeIdOf = (snapshot: CookSnapshot): string =>
  isActive(snapshot) ? snapshot.smokeId : '';

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
