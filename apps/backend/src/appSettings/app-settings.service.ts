import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventsGateway } from '../websocket/events.gateway';
import {
  DEFAULT_APPLICATION_SETTINGS,
  withSettingsDefaults,
} from './app-settings.defaults';
import {
  ApplicationSettings,
  ApplicationSettingsDocument,
} from './app-settings.schema';
import { isCoherentPreference } from './appearance';
import { withSeededTargets } from './meat-presets';
import { CookStamp, validateStamps } from './stamp-catalogue';
import {
  ResolvedApplicationSettings,
  resolveProbeNames,
  withResolvedProbeNames,
} from './probe-names';
import { SmokeProfile } from '../smokeProfile/smokeProfile.schema';
import { SmokeProfileService } from '../smokeProfile/smokeProfile.service';
import { StateService } from '../State/state.service';

/**
 * The one field of the deleted freeform rule schema: an array of rules, none of
 * which ever fired correctly. Named here so a save can clear it.
 */
const LEGACY_RULES_FIELD = 'settings';

@Injectable()
export class AppSettingsService {
  constructor(
    @InjectModel(ApplicationSettings.name)
    private appSettingsModel: Model<ApplicationSettingsDocument>,
    private stateService: StateService,
    private smokeProfileService: SmokeProfileService,
    private readonly events: EventsGateway,
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
   * The settings as a client displays them: the stored document, plus the name
   * each probe row is called by in the cook that is set up right now.
   *
   * Names are resolved here rather than stored, because the entries are keyed by
   * slot and outlive any one cook. With no session set up there is nothing to
   * resolve from, so the rows fall back to their generic slot labels. A session
   * that exists but has no smoke profile saved yet falls back the same way: the
   * profile service answers that window with placeholders of its own, which
   * `resolveProbeNames` treats as unresolved rather than as names.
   */
  async getResolvedSettings(): Promise<ResolvedApplicationSettings> {
    const [settings, profile] = await Promise.all([
      this.getSettings(),
      this.currentSmokeProfile(),
    ]);
    return withResolvedProbeNames(settings, resolveProbeNames(profile));
  }

  /** The smoke profile of the session set up right now, if there is one. */
  private async currentSmokeProfile(): Promise<SmokeProfile | null> {
    const session = await this.stateService.GetState();
    if (!session?.smokeId) {
      return null;
    }
    return this.smokeProfileService.getCurrentSmokeProfile();
  }

  /**
   * Apply the default target of the meat being cooked to the probes that are
   * being watched, and answer with the settings as they now stand.
   *
   * Only a probe whose target nobody set by hand is touched: a temperature the
   * user typed is theirs, and a preset overwriting it would be the app quietly
   * disagreeing with the person at the smoker. A probe that is not being
   * watched is left alone for the same reason — seeding it would put a number
   * on a row the user turned off.
   *
   * A meat type the matcher does not recognise seeds nothing and writes
   * nothing, so an unusual cook keeps whatever was configured rather than being
   * given somebody else's done temperature.
   */
  async seedProbeTargets(
    meatType: string | null | undefined,
  ): Promise<ApplicationSettings> {
    const settings = await this.getSettings();
    const seeded = withSeededTargets(
      settings.probeTarget.probes,
      settings.targetPresets,
      meatType,
    );
    // Nothing to apply — an unrecognised meat, or probes that already hold this
    // preset. No write at all: the document is shared with whoever is editing
    // the settings page, so a write that changes nothing is only a chance to
    // lose their edit.
    if (!seeded) {
      return settings;
    }

    return this.saveSettings({
      probeTarget: { ...settings.probeTarget, probes: seeded },
    });
  }

  /**
   * Write the blocks the caller supplied, leaving the others as they are.
   *
   * Block-wise rather than whole-document, because the document now serves two
   * unrelated writers: the settings page saves the chamber alert, and any
   * browser that repaints itself saves the appearance. Either one replacing the
   * whole document would silently reset the other's block.
   *
   * The write is a single update the server applies as one operation, naming
   * only the blocks it was given. Reading the document first and writing the
   * whole thing back would leave a window in which the other writer's change
   * landed and was then undone — an operator saving an alert while another
   * browser repaints is exactly that window, and neither of them would be told.
   *
   * The fields of a supplied block are still named one by one, so a partial
   * block cannot store half a setting, and the deleted freeform rule shape is
   * removed outright rather than carried alongside.
   *
   * An upsert, so the first write needs no separate create step — the browser
   * that chooses an appearance on a fresh installation is writing into an empty
   * database, and the blocks it did not send are created at their defaults.
   */
  async saveSettings(
    incoming: Partial<ApplicationSettings>,
  ): Promise<ApplicationSettings> {
    const defaults = DEFAULT_APPLICATION_SETTINGS;
    const complete = withSettingsDefaults(incoming);

    // Every client reads this document to decide what to paint, so a preference
    // that says two different things is refused rather than stored and left for
    // each reader to interpret its own way.
    if (incoming.appearance && !isCoherentPreference(complete.appearance)) {
      throw new BadRequestException(
        `Appearance mode "${complete.appearance.mode}" cannot resolve to "${complete.appearance.resolvedMode}"`,
      );
    }

    // The stamps decide what every button on both surfaces says and what
    // colour every marker is drawn in, and events are keyed to them forever.
    // A list that broke one of the catalogue's rules is refused at the door
    // rather than stored for each reader to make its own sense of — and the
    // reason travels, because the page that sent it is a page somebody is
    // looking at.
    if (incoming.cookLog) {
      // The list as the client sent it, not the normalized one: normalizing
      // puts a dropped default back, so validating the result would accept a
      // write that removed one and quietly store something else instead.
      const reason = validateStamps(
        (incoming.cookLog.stamps ?? []) as CookStamp[],
      );
      if (reason) {
        throw new BadRequestException(reason);
      }
    }

    const set: Partial<ApplicationSettings> = {};
    const setOnInsert: Partial<ApplicationSettings> = {};
    (
      [
        'chamber',
        'probeTarget',
        'smokeComplete',
        'headsUp',
        'targetPresets',
        'appearance',
        'autoStop',
        'cookLog',
        'servePlan',
      ] as const
    ).forEach((block) => {
      if (incoming[block]) {
        Object.assign(set, { [block]: complete[block] });
      } else {
        Object.assign(setOnInsert, { [block]: defaults[block] });
      }
    });

    const saved = await this.appSettingsModel
      .findOneAndUpdate(
        {},
        {
          ...(Object.keys(set).length > 0 ? { $set: set } : {}),
          ...(Object.keys(setOnInsert).length > 0
            ? { $setOnInsert: setOnInsert }
            : {}),
          // The freeform rule documents of the previous schema are not
          // migrated. Anything saved onto one drops that shape rather than
          // leaving it beside the settings that replaced it.
          $unset: { [LEGACY_RULES_FIELD]: '' },
        },
        { upsert: true, new: true },
      )
      .exec();
    const stored = withSettingsDefaults(saved);

    // The appearance is installation-wide, so the client that wrote it is not
    // the only one it applies to: whoever is connected is told at once rather
    // than left showing the old scheme until something reloads them. Only the
    // appearance is announced — a chamber alert changes nothing anyone is
    // looking at.
    if (incoming.appearance) {
      this.events.broadcastAppearance(stored.appearance);
    }

    // The catalogue is installation-wide in exactly the way the appearance is:
    // the phone edits it, and the touchscreen in the garage is showing the old
    // buttons until something tells it. The whole list travels, so a receiving
    // client replaces what it holds rather than merging a rename into a list
    // that may have had a stamp removed from it.
    if (incoming.cookLog) {
      this.events.broadcastCookLogStamps(stored.cookLog.stamps);
    }

    return stored;
  }
}
