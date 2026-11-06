import { WithDocumentId } from '../common/document-id';
import { Smoke } from '../smoke/smoke.schema';

/**
 * The Active Cook as a fixed value: the one cook the smoker is attached to, as
 * it stood at the moment it was resolved.
 *
 * A value rather than a handle on purpose. One request — or one alert check,
 * which used to work the cook out about six times — resolves once and passes
 * this down, so every decision it makes is about the same cook even if the
 * pitmaster ends it half-way through.
 *
 * The cook's own record travels whole (its stamps, its child-record links, its
 * serve plan, its rest minutes). Its children and the installation's settings
 * do not: a caller that wants one fetches it by the id it finds here, and
 * settings belong to the whole installation rather than to this cook.
 */
export interface ActiveCook {
  /** Discriminator: there is a cook. See {@link IdleCook}. */
  readonly idle: false;
  /** The cook's id, as a string — what the stored state names it by. */
  readonly smokeId: string;
  /** The cook's own record. */
  readonly smoke: Smoke & WithDocumentId;
  /** Whether the smoker is running right now. */
  readonly smoking: boolean;
}

/**
 * No Active Cook: the smoker is attached to nothing.
 *
 * Explicit rather than `null` so that "there is no cook" is a value a caller
 * has to read, and so the smoking flag still travels — the relay path and the
 * alert check both have an opinion about a smoker that is marked as running
 * with no cook behind it.
 */
export interface IdleCook {
  readonly idle: true;
  readonly smoking: boolean;
}

/**
 * What resolving the Active Cook answers: the cook, or idle. The one shape
 * every reader of the current cook takes, so the "no Active Cook" rule is read
 * the same way everywhere instead of being guessed at per caller.
 */
export type CookSnapshot = ActiveCook | IdleCook;

/** Whether a snapshot carries a cook — the type guard that opens it. */
export const isActive = (snapshot: CookSnapshot): snapshot is ActiveCook =>
  snapshot.idle === false;

/** The idle result, carrying the smoking flag the store held. */
export const idleCook = (smoking = false): IdleCook => ({
  idle: true,
  smoking,
});

/**
 * One linked child record of the Active Cook, by the foreign key the cook
 * carries it under.
 *
 * Here rather than on the snapshot because the links are the cook's and the
 * children are not loaded with it: a reader asks the snapshot for the id of
 * the child it wants, and fetches that child itself.
 */
export type CookChildKey =
  | 'preSmokeId'
  | 'postSmokeId'
  | 'smokeProfileId'
  | 'tempsId'
  | 'ratingId';

/**
 * The id the Active Cook links one of its children under, or `null` where
 * there is no cook or the cook has no such child yet.
 */
export const childIdOf = (
  snapshot: CookSnapshot,
  key: CookChildKey,
): string | null => {
  if (!isActive(snapshot)) {
    return null;
  }
  const childId = snapshot.smoke[key];
  return childId ? String(childId) : null;
};

/**
 * Reading the Active Cook, as every module that only reads it depends on it.
 *
 * Named as an interface so a test may stand a built snapshot behind it (see
 * `fakeActiveCook`) instead of mocking the stored state and the cook archive —
 * which is what up to eleven mocked providers per spec used to be for.
 */
export interface ActiveCookReader {
  /** The Active Cook as it stands, or idle. Never writes. */
  resolve(): Promise<CookSnapshot>;
}
