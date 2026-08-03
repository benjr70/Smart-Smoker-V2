import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { withSettingsDefaults } from './app-settings.defaults';
import {
  ApplicationSettings,
  ApplicationSettingsDocument,
} from './app-settings.schema';
import { isCoherentPreference } from './appearance';

@Injectable()
export class AppSettingsService {
  constructor(
    @InjectModel(ApplicationSettings.name)
    private appSettingsModel: Model<ApplicationSettingsDocument>,
  ) {}

  /**
   * The current settings, always complete. A deployment with no document — or
   * with a document of the deleted rule shape, which is not migrated — reads as
   * fresh defaults rather than as an error.
   */
  async getSettings(): Promise<ApplicationSettings> {
    const stored = await this.appSettingsModel.findOne().exec();
    return withSettingsDefaults(stored);
  }

  /**
   * Write the blocks the caller supplied, leaving the others as they are.
   *
   * Block-wise rather than whole-document, because the document now serves two
   * unrelated writers: the settings page saves the chamber alert, and any
   * browser that repaints itself saves the appearance. Either one replacing the
   * whole document would silently reset the other's block.
   *
   * The document is still *replaced* rather than patched, so the deleted
   * freeform rule shape cannot survive a save: what is written is composed field
   * by field from the stored document, the incoming blocks and the defaults, and
   * nothing else is carried over.
   *
   * An upsert, so the first write needs no separate create step — the browser
   * that chooses an appearance on a fresh installation is writing into an empty
   * database.
   */
  async saveSettings(
    incoming: Partial<ApplicationSettings>,
  ): Promise<ApplicationSettings> {
    const stored = await this.getSettings();
    const merged = withSettingsDefaults({
      chamber: incoming.chamber ?? stored.chamber,
      appearance: incoming.appearance ?? stored.appearance,
    });

    // Every client reads this document to decide what to paint, so a preference
    // that says two different things is refused rather than stored and left for
    // each reader to interpret its own way.
    if (!isCoherentPreference(merged.appearance)) {
      throw new BadRequestException(
        `Appearance mode "${merged.appearance.mode}" cannot resolve to "${merged.appearance.resolvedMode}"`,
      );
    }

    const saved = await this.appSettingsModel
      .findOneAndReplace({}, merged, { upsert: true, new: true })
      .exec();
    return withSettingsDefaults(saved);
  }
}
