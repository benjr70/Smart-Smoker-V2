import { Model } from 'mongoose';
import { withSettingsDefaults } from '../appSettings/app-settings.defaults';
import { ApplicationSettingsDocument } from '../appSettings/app-settings.schema';
import { SmokeDocument } from '../smoke/smoke.schema';
import {
  edgeReadingRow,
  peakChamberOf,
  SeriesOwner,
} from '../temps/series-reads';
import { TempDocument } from '../temps/temps.schema';
import { momentOf, probeSeries } from '../timeline/timeline.derive';
import {
  primaryWatchedProbe,
  primaryWatchedTarget,
} from '../timeline/watched-probe';

/**
 * The three moments a cook is stamped with — when it began, when the meat came
 * off, when it was over — each written once and never moved.
 *
 * The write-once rule is the whole of this file. Every stamp is a conditional
 * update filtered on the stamp still being absent, so a second press, a screen
 * that remounts, or two phones acting at the same instant cannot move a moment
 * that has already been recorded; each answers whether *this* call was the one
 * that wrote, which is how the Active Cook runs a transition's side effects
 * exactly once.
 *
 * Functions over the collections rather than a service, because the two sides
 * that need them cannot depend on each other: the Active Cook owns the
 * transitions and is depended on by everything, the timeline derives over the
 * stamps and depends on the Active Cook. See {@link StampCollections}.
 */
export interface StampCollections {
  smokeModel: Model<SmokeDocument>;
  /** The cook's readings: where a start is bounded and a peak is scanned. */
  tempModel: Model<TempDocument>;
  /** The installation's settings: what the meat was being taken to. */
  settingsModel: Model<ApplicationSettingsDocument>;
}

/**
 * Record that a cook has begun, if it has not already — no later than the
 * readings it has already taken.
 *
 * The condition is part of the write rather than a read beforehand, so a
 * second toggle — or two clients toggling at once — cannot move a start that
 * has already happened. Smoking is stopped and restarted freely during a cook;
 * only the first time is the time it started.
 *
 * The moment is not simply now, because this stamp is written after the flip
 * that triggers it: a write that fails leaves a cook recording without a
 * start, and the next switch-on stamps it hours in. A cook cannot have begun
 * after readings it had already taken, so its earliest reading is the latest a
 * start may be stamped at, and a cook that has recorded nothing yet — every
 * ordinary first press — starts now. Readings are only ever stored while
 * smoking is on and every cook gets its own series, so a series' first reading
 * belongs to this cook and to no other.
 *
 * The read before the write is not the guard; the conditional write still is.
 * It only decides what would be written, and two toggles racing on a cook with
 * no start yet compute the same answer from the same series.
 */
export const stampCookStart = async (
  collections: StampCollections,
  smokeId: string,
): Promise<boolean> => {
  const { smokeModel, tempModel } = collections;
  const smoke = await smokeModel.findById(smokeId).exec();
  if (!smoke || smoke.startedAt) {
    return false;
  }
  const now = new Date();
  const firstReading = await firstReadingAt(tempModel, smoke);
  const startedAt =
    firstReading && firstReading.getTime() < now.getTime() ? firstReading : now;
  const result = await smokeModel
    .updateOne({ _id: smokeId, startedAt: null }, { $set: { startedAt } })
    .exec();
  return result.modifiedCount > 0;
};

/**
 * Record that the meat has come off, if it has not already: when it did, and
 * what the watched probe read as it did.
 *
 * Stamped by the server rather than asked of the pitmaster because the gesture
 * that ends the cook — leaving the Smoke step — is the gesture that pulls the
 * meat, and everything the rest is measured from (the countdown, the
 * carryover, the safe-to-hold window) hangs off this one moment.
 *
 * The temperature is snapshotted rather than looked up later for the same
 * reason the finished cook's target is: the readings go on arriving after the
 * meat is off the smoker, and a probe left in a resting brisket — or pulled out
 * and left on the bench — would rewrite what the meat was pulled at. `null`
 * where no probe is being watched or none has read: nothing was measuring this
 * meat, and a stamped zero would say something about it that nobody knows.
 */
export const stampCookPull = async (
  collections: StampCollections,
  smokeId: string,
): Promise<boolean> => {
  const { smokeModel, tempModel, settingsModel } = collections;
  const smoke = await smokeModel.findById(smokeId).exec();
  if (!smoke || smoke.pullAt) {
    return false;
  }
  const settings = withSettingsDefaults(await settingsModel.findOne().exec());
  const pullTemp = await watchedProbeTemp(
    tempModel,
    smoke,
    primaryWatchedProbe(settings)?.slot,
  );
  const result = await smokeModel
    .updateOne(
      { _id: smokeId, pullAt: null },
      {
        $set: {
          pullAt: new Date(),
          ...(pullTemp === null ? {} : { pullTemp }),
        },
      },
    )
    .exec();
  return result.modifiedCount > 0;
};

/**
 * Record that a cook was over at a given moment, and what it was being taken
 * to.
 *
 * The moment is a parameter because a cook does not always end when somebody
 * notices it has: a cook whose readings stopped yesterday finished yesterday,
 * and stamping the moment of the noticing would record a cook that ran until
 * the app was next opened. The peak is scanned over the rows at or before that
 * moment for the same reason — a stray firing of the box after the cook is not
 * the cook's peak.
 *
 * `peakScanUntil` is that bound, and defaults to the finish. A caller may pass
 * `null` to scan the whole series instead, which is what the manual finish
 * does: the bound necessarily drops rows stored without a date (a row that
 * cannot say when it was read cannot be placed inside the window), and
 * dropping them on a path that never did would quietly lower the peak it
 * stamps.
 *
 * The target is snapshotted here rather than read back later because the
 * settings it comes from go on being edited: a cook finished at 203°F must
 * still read 203°F after the next one is set up for chicken. Conditional for
 * the same reason as the start — a finish that already happened is not moved,
 * and its snapshot is not rewritten.
 *
 * The cook is read before any of that work is done, and a finish that has
 * already happened stops here: the guard on the write would reject it anyway,
 * and everything between the two — a settings read and a scan of the whole
 * series for its peak — would have been done to be thrown away. The guard
 * still stands, because two clients finishing at once can both get past this
 * read.
 */
export const stampCookFinishAt = async (
  collections: StampCollections,
  smokeId: string,
  finishedAt: Date,
  peakScanUntil: Date | null = finishedAt,
): Promise<boolean> => {
  const { smokeModel, tempModel, settingsModel } = collections;
  const smoke = await smokeModel.findById(smokeId).exec();
  if (!smoke || smoke.finishedAt) {
    return false;
  }
  const stored = await settingsModel.findOne().exec();
  const targetTemp = primaryWatchedTarget(withSettingsDefaults(stored));
  const peakChamber = await peakChamberOf(tempModel, smoke, peakScanUntil);
  const result = await smokeModel
    .updateOne(
      { _id: smokeId, finishedAt: null },
      {
        $set: {
          finishedAt,
          targetTemp,
          // Recorded whatever the readings said, so that a cook whose series
          // held nothing readable is never scanned for a peak again — see the
          // field's own note.
          peakChamberScanned: true,
          // The peak itself only where the cook recorded one: a series with no
          // readable chamber reading has no peak, and a stamped zero would be
          // a claim about how the cook ran.
          ...(peakChamber === null ? {} : { peakChamber }),
        },
      },
    )
    .exec();
  return result.modifiedCount > 0;
};

/** The moment of a cook's earliest dated reading, if it kept any. */
const firstReadingAt = async (
  tempModel: Model<TempDocument>,
  smoke: SeriesOwner,
): Promise<Date | null> => {
  const row = await edgeReadingRow(tempModel, smoke, 1);
  return row ? momentOf(row) : null;
};

/**
 * What the watched probe read last, °F, or `null` where it has read nothing.
 *
 * The newest dated row of the whole series: a smoker that has been silent for
 * a while still has a last reading, and it is the one the meat was pulled at.
 */
const watchedProbeTemp = async (
  tempModel: Model<TempDocument>,
  smoke: SeriesOwner,
  slot: string | null | undefined,
): Promise<number | null> => {
  const row = await edgeReadingRow(tempModel, smoke, -1);
  if (!row || !slot) {
    return null;
  }
  // Through `probeSeries` so an unplugged probe's zero is dropped here for the
  // same reason it is dropped from the climb: it is not a temperature anything
  // took.
  return probeSeries([row], slot, null)[0]?.temp ?? null;
};
