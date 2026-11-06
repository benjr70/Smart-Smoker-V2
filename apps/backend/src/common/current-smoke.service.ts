import { Injectable, NotFoundException } from '@nestjs/common';
import {
  childIdOf,
  CookSnapshot,
  isActive,
} from '../activeCook/active-cook';
import { ActiveCookService } from '../activeCook/active-cook.service';
import { SmokeService } from '../smoke/smoke.service';
import { Smoke } from '../smoke/smoke.schema';
import { SmokeDto } from '../smoke/smokeDto';

/** The linked-child foreign keys carried on a Smoke aggregate. */
export type SmokeChildKey =
  | 'preSmokeId'
  | 'postSmokeId'
  | 'smokeProfileId'
  | 'tempsId'
  | 'ratingId';

interface UpsertHandlers<T> {
  /** Update the already-linked child (given its id). */
  update: (childId: string) => Promise<T>;
  /** Create a new child; return the result plus the new child id to link. */
  create: () => Promise<{ result: T; childId: string }>;
  /** Rare per-entity hook run on the create path (e.g. ratings-seed). */
  onResolveSmoke?: (smoke: Smoke) => Promise<void> | void;
}

/**
 * The single implementation of the `Active Cook → child` walk that was
 * previously copy-pasted (with divergence) across ~5 services.
 *
 * Which cook that is comes from the Active Cook, the one module that answers
 * it: this used to walk the stored state itself, and self-heal the state
 * document it found missing — a write made from a read, on paths including the
 * reading-ingest one.
 *
 * Two explicit null policies left:
 * - `readCurrent`  → returns a caller-supplied fallback when nothing is active
 *                    (null is legitimate for a "current X" read).
 * - `upsertCurrent`→ throws 404 when there is no active smoke; on create it
 *                    links the new child id back onto the Smoke, preserving the
 *                    sibling foreign keys.
 */
@Injectable()
export class CurrentSmokeService {
  constructor(
    private readonly activeCook: ActiveCookService,
    private readonly smokeService: SmokeService,
  ) {}

  async currentSmoke(): Promise<Smoke | null> {
    const cook = await this.activeCook.resolve();
    return isActive(cook) ? cook.smoke : null;
  }

  /**
   * One child record of the cook in progress, or the caller's fallback where
   * there is no cook or no such child.
   *
   * `cook` is the Active Cook a caller has already resolved and is passing
   * down — one alert check reads the readings, the profile and the pre-smoke of
   * one cook. Omitted, this resolves it itself, which is what every route does.
   */
  async readCurrent<T>(
    key: SmokeChildKey,
    load: (childId: string) => Promise<T>,
    fallback: T,
    cook?: CookSnapshot,
  ): Promise<T> {
    const childId = childIdOf(cook ?? (await this.activeCook.resolve()), key);
    if (!childId) {
      return fallback;
    }
    return load(childId);
  }

  async upsertCurrent<T>(
    key: SmokeChildKey,
    handlers: UpsertHandlers<T>,
  ): Promise<T> {
    const smoke = await this.currentSmoke();
    if (!smoke) {
      throw new NotFoundException('No active smoke');
    }

    const existingChildId = smoke[key];
    if (existingChildId) {
      return handlers.update(existingChildId);
    }

    const { result, childId } = await handlers.create();

    const smokeDto: SmokeDto = {
      preSmokeId: smoke.preSmokeId,
      postSmokeId: smoke.postSmokeId,
      smokeProfileId: smoke.smokeProfileId,
      tempsId: smoke.tempsId,
      ratingId: smoke.ratingId,
      status: smoke.status,
      [key]: childId,
    };
    await this.smokeService.update(smoke['_id'].toString(), smokeDto);

    if (handlers.onResolveSmoke) {
      await handlers.onResolveSmoke(smoke);
    }

    return result;
  }
}
