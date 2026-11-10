import { WithDocumentId } from '../../common/document-id';
import { Smoke } from '../../smoke/smoke.schema';
import {
  ActiveCook,
  ActiveCookChildren,
  attachToCook,
  ChildAttachment,
  CookChildKey,
  CookSnapshot,
  idleCook,
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
export interface FakeActiveCook extends ActiveCookChildren {
  /** Recording, so a spec can hold one request to one resolve. */
  resolve: jest.Mock<Promise<CookSnapshot>, []>;
  /** Recording, so a spec can hold a write to one attach of one kind. */
  attach: jest.Mock<Promise<any>, [CookChildKey, ChildAttachment<any>]>;
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
    pointAt,
    cook: () => current,
  };
};

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
