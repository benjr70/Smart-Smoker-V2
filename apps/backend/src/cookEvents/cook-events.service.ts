import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { StateService } from '../State/state.service';
import { AppSettingsService } from '../appSettings/app-settings.service';
import {
  CookStamp,
  defaultStamps,
  findStamp,
} from '../appSettings/stamp-catalogue';
import { CurrentSmokeService } from '../common/current-smoke.service';
import { Temp } from '../temps/temps.schema';
import { TempsService } from '../temps/temps.service';
import { EventsGateway } from '../websocket/events.gateway';
import { CookEvent, CookEventDocument } from './cook-events.schema';
import { cookEventsOfSmoke } from './cook-events.filter';

/**
 * One reading as a snapshot stores it: the number it is, or `null` when the
 * probe reported nothing readable — which is what a cook stamped before its
 * first reading has, and what an unplugged probe's blank sends.
 */
const snapshotReading = (value: string | number | undefined): number | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const reading = Number(value);
  return Number.isFinite(reading) ? reading : null;
};

/**
 * How far a caller's clock may disagree with the server's and still be
 * believed. A moment this far ahead of the server is taken as now, and one this
 * far before the cook's start as the start; anything further out is refused.
 * Two minutes is far more than two NTP-synced clocks differ by and far less
 * than would let a stamp be dated meaningfully into the future.
 */
export const COOK_EVENT_CLOCK_SKEW_MS = 2 * 60 * 1000;

/**
 * How far back a stamp may say it was done.
 *
 * The only caller that dates a stamp is Voice Fill, which logs it at the time
 * of the Ramble: the gap is the time the review list was left open, which is
 * minutes. Half an hour covers a cook who walked to the pit and back before
 * tapping Fill, and stops well short of making this a way to rewrite the log.
 */
export const COOK_EVENT_MAX_BACKDATE_MS = 30 * 60 * 1000;

/**
 * The cook log: what the pitmaster did, when, and what the pit was doing when
 * they did it.
 *
 * The service owns two decisions the clients must not make. The moment of a tap
 * is the server's clock, because the smoker touchscreen and a phone disagree
 * about what time it is and a log ordered by their clocks would reorder itself.
 * The one exception is a stamp that says when it was done — one spoken some
 * minutes before it was logged — and that moment is believed only inside the
 * window {@link CookEventsService.record} holds it to. The temperatures are
 * read here too, from the stored reading for the entry's moment, because a
 * client sends only which button was pressed — anything it sent about the pit
 * would be whatever its own screen last happened to receive.
 *
 * Every write announces the whole log over the websocket, so a tap on the
 * phone shows on the touchscreen and vice versa. Deleting a cook's events with
 * the cook is not done here: see {@link cookEventsOfSmoke}.
 */
@Injectable()
export class CookEventsService extends BaseService<CookEventDocument> {
  constructor(
    @InjectModel('CookEvent') model: Model<CookEventDocument>,
    private readonly state: StateService,
    private readonly settings: AppSettingsService,
    private readonly temps: TempsService,
    private readonly currentSmoke: CurrentSmokeService,
    private readonly events: EventsGateway,
  ) {
    super(model, 'CookEvent');
  }

  /**
   * Log one tap against the cook in progress.
   *
   * A stamp nobody has heard of is the caller's mistake (400); no cook to log
   * against is a conflict with the state of the session (409), which is what
   * the clients tell apart to say "not logged" rather than "nothing is
   * cooking".
   *
   * Given no `at`, the entry is stamped by the server's clock with the newest
   * reading. Given one, it carries that moment and the reading for it — if the
   * moment is one a stamp may be dated to (see {@link momentOf}); one that is
   * not is the caller's mistake too (400).
   */
  async record(stampKey: string, at?: Date): Promise<CookEvent> {
    const stamp = findStamp(stampKey, await this.catalogue());
    // A stamp nobody offers and one the user switched off are refused alike:
    // both mean the tap could only have come from a client showing buttons the
    // catalogue no longer has, and neither may put an unreachable stamp into
    // the log.
    if (!stamp || !stamp.enabled) {
      throw new BadRequestException(`Unknown stamp: ${stampKey}`);
    }
    const smokeId = await this.currentSmokeId();
    if (!smokeId) {
      throw new ConflictException('No smoke is in progress');
    }
    const moment = at === undefined ? undefined : await this.momentOf(at);
    const reading = await this.readingAt(moment);
    const recorded = await this.create({
      smokeId,
      stampKey: stamp.key,
      label: stamp.label,
      tone: stamp.tone,
      at: moment ?? new Date(),
      chamberTemp: snapshotReading(reading?.ChamberTemp),
      probe1Temp: snapshotReading(reading?.MeatTemp),
      probe2Temp: snapshotReading(reading?.Meat2Temp),
      probe3Temp: snapshotReading(reading?.Meat3Temp),
    } as Partial<CookEventDocument>);
    await this.announce(smokeId);
    return recorded;
  }

  /**
   * The stamps on offer right now.
   *
   * Read per tap rather than held, because the catalogue is edited from a
   * phone while the touchscreen is hot: a cached copy would go on accepting a
   * stamp the user has just switched off, and would record the label it used
   * to have. A settings read that cannot be made falls back to the shipped
   * defaults — the six always exist, so a tap on one of them is still logged
   * rather than lost to an unrelated failure.
   */
  private async catalogue(): Promise<CookStamp[]> {
    try {
      return (await this.settings.getSettings()).cookLog.stamps;
    } catch (err) {
      this.logFailure('could not read the stamp catalogue', err);
      return defaultStamps();
    }
  }

  /** The in-progress cook's log, oldest first — the order it happened in. */
  async listCurrent(): Promise<CookEvent[]> {
    const smokeId = await this.currentSmokeId();
    return smokeId ? this.listForSmoke(smokeId) : [];
  }

  /** One stored cook's log, oldest first. */
  async listForSmoke(smokeId: string): Promise<CookEvent[]> {
    return this.model.find(cookEventsOfSmoke(smokeId)).sort({ at: 1 }).exec();
  }

  /**
   * Remove one mis-tapped event, and announce what is left.
   *
   * The announcement carries the current cook's log whatever cook the removed
   * event belonged to: what every live screen is showing is the current cook,
   * and one deleted out of last week's is no reason to leave them stale.
   */
  async remove(id: string) {
    const deleted = await this.delete(id);
    await this.announce(await this.currentSmokeId());
    return deleted;
  }

  /** The cook set up right now, or `undefined` when the session is empty. */
  private async currentSmokeId(): Promise<string | undefined> {
    const state = await this.state.GetState();
    return state?.smokeId?.length ? state.smokeId : undefined;
  }

  /**
   * The moment an entry is stored under, for a caller that said when it was
   * done — or a 400 when that moment is not one a stamp may be dated to.
   *
   * The window is from {@link COOK_EVENT_MAX_BACKDATE_MS} ago — or the cook's
   * start, if that is later — up to now. Either end forgives a caller whose
   * clock is off by up to {@link COOK_EVENT_CLOCK_SKEW_MS}, by storing the end
   * itself: no entry is ever dated after the server's own clock or before its
   * own cook, so the log's order stays one the server can vouch for.
   */
  private async momentOf(at: Date): Promise<Date> {
    const now = Date.now();
    const given = at.getTime();
    if (given > now + COOK_EVENT_CLOCK_SKEW_MS) {
      throw new BadRequestException('A stamp cannot be dated in the future');
    }
    if (given < now - COOK_EVENT_MAX_BACKDATE_MS) {
      throw new BadRequestException('A stamp cannot be dated that far back');
    }
    const startedAt = (await this.cookStartedAt())?.getTime();
    if (
      startedAt !== undefined &&
      given < startedAt - COOK_EVENT_CLOCK_SKEW_MS
    ) {
      throw new BadRequestException(
        'A stamp cannot be dated before its cook started',
      );
    }
    return new Date(Math.min(now, Math.max(given, startedAt ?? given)));
  }

  /**
   * When the cook in progress started, or `undefined` when it carries no start
   * — and `undefined` too when the cook could not be read. The window alone
   * still bounds the moment then, and a stamp is not lost to an unrelated
   * failure.
   */
  private async cookStartedAt(): Promise<Date | undefined> {
    try {
      const startedAt = (await this.currentSmoke.currentSmoke())?.startedAt;
      return startedAt ? new Date(startedAt) : undefined;
    } catch (err) {
      this.logFailure('could not read when the cook started', err);
      return undefined;
    }
  }

  /**
   * The reading an entry carries: the newest of the cook for a tap, the one
   * for `moment` for a stamp that says when it was done — or `undefined` when
   * the cook has taken none, and `undefined` too when the reading could not be
   * read at all. A tap that reached the backend is logged: temperatures nobody
   * could fetch make the entry less informative, while failing the tap makes
   * the pitmaster stand at a hot smoker pressing a button that does nothing.
   */
  private async readingAt(moment?: Date): Promise<Temp | undefined> {
    try {
      return moment
        ? await this.temps.getCurrentTempAt(moment)
        : await this.temps.getLatestCurrentTemp();
    } catch (err) {
      this.logFailure('could not read the pit for a cook event', err);
      return undefined;
    }
  }

  /**
   * Tell every connected client what the log now says.
   *
   * Never fails the write it follows: the event is stored, and a screen that
   * missed the announcement reads the log on its next load. Throwing here
   * would answer a tap that *was* logged with an error, and the pitmaster
   * would tap again.
   */
  private async announce(smokeId: string | undefined): Promise<void> {
    try {
      this.events.broadcastCookEvents(
        smokeId ? await this.listForSmoke(smokeId) : [],
      );
    } catch (err) {
      this.logFailure('could not announce the cook log', err);
    }
  }

  private logFailure(what: string, err: unknown): void {
    Logger.error(
      `${what}: ${err instanceof Error ? err.message : String(err)}`,
      'CookEvents',
    );
  }
}
