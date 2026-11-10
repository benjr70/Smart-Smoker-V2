import { WithDocumentId } from '../../common/document-id';
import { Smoke } from '../../smoke/smoke.schema';
import {
  ActiveCook,
  ActiveCookReader,
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
export interface FakeActiveCook extends ActiveCookReader {
  /** Recording, so a spec can hold one request to one resolve. */
  resolve: jest.Mock<Promise<CookSnapshot>, []>;
  /** Point it at a different cook, or at idle, after it was built. */
  attach(snapshot: CookSnapshot): void;
}

/** A reader answering `snapshot`, or idle when none is given. */
export const fakeActiveCook = (
  snapshot: CookSnapshot = idleCook(),
): FakeActiveCook => {
  let current = snapshot;
  return {
    resolve: jest.fn(async () => current),
    attach(next: CookSnapshot): void {
      current = next;
    },
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
