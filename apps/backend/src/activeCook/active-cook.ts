import { NotFoundException } from '@nestjs/common';
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
 * The Active Cook's own record, or `null` where the smoker is idle.
 *
 * The one place the three idle cases become the `null` that the routes
 * answering "the cook in progress" have always answered — so a reader never
 * has to decide for itself whether a missing state, an empty id or a deleted
 * cook is the same thing. It is.
 */
export const smokeOf = (
  snapshot: CookSnapshot,
): (Smoke & WithDocumentId) | null =>
  isActive(snapshot) ? snapshot.smoke : null;

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
  const childId = smokeOf(snapshot)?.[key];
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

/**
 * What the routes have always answered when asked to write a child record of a
 * cook that is not there. Kept as the one string so that moving the callers
 * over cannot quietly change the 404 a client reads.
 */
export const NO_ACTIVE_COOK = 'No active smoke';

/**
 * How one kind of child record is written, as the module that owns it says so.
 *
 * The Active Cook knows whether a record is already linked and what linking a
 * new one means for the cook; it knows nothing about what a post-smoke or a
 * rating *is*. So the caller brings the two writes and the Active Cook decides
 * which of them happens.
 */
export interface ChildAttachment<T> {
  /** Write the record the cook already links, given its id. */
  update: (childId: string) => Promise<T>;
  /** Write a new record; answer it, and the id to link it under. */
  create: () => Promise<{ result: T; childId: string }>;
  /**
   * Run after a record has been created and linked, never after an update —
   * the rare per-kind rule that only fires the first time a cook gains this
   * child (the ratings seed is the only one). Handed the cook as it stood
   * before the link, which is the cook whose other links it reads.
   */
  onFirstAttach?: (cook: ActiveCook) => Promise<void> | void;
}

/**
 * Attaching one child record to the Active Cook — the whole rule, in one place.
 *
 * Update the record the cook already links; otherwise create it, link its id,
 * and run the first-attach hook. With no cook it is a 404, because every route
 * that writes a child of "the cook in progress" is a route about a cook that
 * has to exist.
 *
 * A function over a snapshot rather than a method so that the real module and
 * the test fake behind {@link ActiveCookChildren} run the same rule: a fake
 * that re-implemented it would be free to describe an attach the real one
 * could never do. `link` is the only part that differs — storage for one, the
 * fake's own snapshot for the other.
 */
export const attachToCook = async <T>(
  snapshot: CookSnapshot,
  key: CookChildKey,
  attachment: ChildAttachment<T>,
  link: (cook: ActiveCook, childId: string) => Promise<void>,
): Promise<T> => {
  if (!isActive(snapshot)) {
    throw new NotFoundException(NO_ACTIVE_COOK);
  }
  const linked = childIdOf(snapshot, key);
  if (linked) {
    return attachment.update(linked);
  }
  const { result, childId } = await attachment.create();
  await link(snapshot, childId);
  // After the link, so that a hook which reads the cook again sees the child
  // it fired for — the ratings seed asks whether the cook is scored, and a
  // hook running before the link would be answered about a cook mid-attach.
  await attachment.onFirstAttach?.(snapshot);
  return result;
};

/**
 * Reading the Active Cook and attaching a child record to it: what every
 * module that owns one of the cook's children depends on.
 *
 * Reading is separate ({@link ActiveCookReader}) because most callers only
 * read; this is the narrower set that also writes.
 */
export interface ActiveCookChildren extends ActiveCookReader {
  /** See {@link attachToCook}. Answers the child record. */
  attach<T>(key: CookChildKey, attachment: ChildAttachment<T>): Promise<T>;
}
