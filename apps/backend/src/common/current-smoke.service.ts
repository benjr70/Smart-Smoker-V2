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
 *
 * Reads and writes agree on what a dangling child link means: `readCurrent`
 * answers the fallback and `upsertCurrent` recreates the child, so the empty
 * form a read hands out is always one a write can save.
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
    return this.smokeService.getById(state.smokeId);
  }

  async readCurrent<T>(
    key: SmokeChildKey,
    load: (childId: string) => Promise<T | null>,
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
    // `load` is a by-id lookup, so it is nullable: the key can outlive the
    // document it points at. A dangling link is the same "nothing active"
    // answer as an unlinked key, and the fallback is what the caller asked
    // for in that case.
    return (await load(childId)) ?? fallback;
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
      try {
        return await handlers.update(existingChildId);
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          throw error;
        }
        // The link is dangling: the key outlived the document it points at.
        // `readCurrent` answers that with the fallback — a healthy, empty
        // form — so the write path has to agree, or the client is handed a
        // 200 it can never save. Falling through to create relinks a fresh
        // child id onto the smoke and heals the aggregate.
      }
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
