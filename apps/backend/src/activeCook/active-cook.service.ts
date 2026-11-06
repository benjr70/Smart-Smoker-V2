import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SmokeDocument } from '../smoke/smoke.schema';
import { StateDocument } from '../State/state.schema';
import { ActiveCookReader, CookSnapshot, idleCook } from './active-cook';

/**
 * The one place that answers "which cook is the smoker attached to".
 *
 * Deliberately owns the two collections it reads rather than depending on the
 * services around them. Every module that reaches the current cook depends on
 * this one, so a service edge in the other direction would close a DI cycle —
 * which is exactly what the old current-smoke helper, built on `StateService`
 * and `SmokeService`, could not escape.
 */
@Injectable()
export class ActiveCookService implements ActiveCookReader {
  constructor(
    @InjectModel('state') private readonly stateModel: Model<StateDocument>,
    @InjectModel('Smoke') private readonly smokeModel: Model<SmokeDocument>,
  ) {}

  /**
   * The Active Cook as it stands, or idle.
   *
   * Three things count as idle, and this is the one place that says so: no
   * state document at all (a fresh install, before anything has been written),
   * a state that names no cook, and a state naming a cook the archive no
   * longer holds. Callers used to answer each of those differently — one
   * created the missing document as it read, one returned `null`, one
   * dereferenced it and took the process down.
   *
   * The smoking flag travels either way, because a smoker marked as running
   * with no cook behind it is a thing both the relay path and the alert check
   * have to be able to see.
   *
   * Reads never write. The self-heal that created the state document from a
   * read is gone: seeding the singleton at startup is what covers a fresh
   * install, which leaves this safe to call from anywhere, the reading-ingest
   * path included.
   */
  async resolve(): Promise<CookSnapshot> {
    const state = await this.stateModel.findOne().exec();
    if (!state) {
      return idleCook();
    }
    const smoking = state.smoking === true;
    if (!state.smokeId || state.smokeId.length === 0) {
      return idleCook(smoking);
    }
    const smoke = await this.smokeModel.findById(state.smokeId).exec();
    if (!smoke) {
      // Logged rather than repaired: the repair is a write, and this read is
      // made on the hottest path in the application. Worth saying out loud all
      // the same — a state pointing at a deleted cook is how the smoker ends
      // up stuck, and nothing else in the request notices.
      Logger.warn(
        `the stored state names cook ${state.smokeId}, which no longer exists; reading as idle`,
        'ActiveCook',
      );
      return idleCook(smoking);
    }
    return {
      idle: false,
      smokeId: String(state.smokeId),
      smoke,
      smoking,
    };
  }
}
