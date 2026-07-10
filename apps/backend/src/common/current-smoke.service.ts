import { Injectable, NotFoundException } from '@nestjs/common';
import { StateService } from '../State/state.service';
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
 * The single implementation of the `state → smoke → child` walk that was
 * previously copy-pasted (with divergence) across ~5 services.
 *
 * Three explicit null policies:
 * - `readCurrent`  → returns a caller-supplied fallback when nothing is active
 *                    (null is legitimate for a "current X" read).
 * - `upsertCurrent`→ throws 404 when there is no active smoke; on create it
 *                    links the new child id back onto the Smoke, preserving the
 *                    sibling foreign keys.
 * - `currentSmoke` → self-heals a missing state doc exactly once.
 */
@Injectable()
export class CurrentSmokeService {
  constructor(
    private readonly stateService: StateService,
    private readonly smokeService: SmokeService,
  ) {}

  async currentSmoke(): Promise<Smoke | null> {
    let state = await this.stateService.GetState();
    if (!state) {
      state = await this.stateService.create({ smokeId: '', smoking: false });
    }
    if (!state.smokeId || state.smokeId.length === 0) {
      return null;
    }
    return this.smokeService.GetById(state.smokeId);
  }

  async readCurrent<T>(
    key: SmokeChildKey,
    load: (childId: string) => Promise<T>,
    fallback: T,
  ): Promise<T> {
    const smoke = await this.currentSmoke();
    if (!smoke) {
      return fallback;
    }
    const childId = smoke[key];
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
    await this.smokeService.Update(smoke['_id'].toString(), smokeDto);

    if (handlers.onResolveSmoke) {
      await handlers.onResolveSmoke(smoke);
    }

    return result;
  }
}
