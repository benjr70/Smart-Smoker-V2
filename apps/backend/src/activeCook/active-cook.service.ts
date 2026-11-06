import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SmokeDocument } from '../smoke/smoke.schema';
import { StateDocument } from '../State/state.schema';
import { ActiveCookReader, CookSnapshot } from './active-cook';

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

  async resolve(): Promise<CookSnapshot> {
    const state = await this.stateModel.findOne().exec();
    return {
      idle: false,
      smokeId: String(state.smokeId),
      smoke: await this.smokeModel.findById(state.smokeId).exec(),
      smoking: state.smoking === true,
    };
  }
}
