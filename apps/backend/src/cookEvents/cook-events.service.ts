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
import { findStamp } from '../appSettings/stamp-catalogue';
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
 * The cook log: what the pitmaster did, when, and what the pit was doing when
 * they did it.
 *
 * The service owns two decisions the clients must not make. The moment is the
 * server's clock, because the smoker touchscreen and a phone disagree about
 * what time it is and a log ordered by their clocks would reorder itself. The
 * temperatures are read here too, from the newest stored reading, because a
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
    private readonly temps: TempsService,
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
   */
  async record(stampKey: string): Promise<CookEvent> {
    const stamp = findStamp(stampKey);
    if (!stamp) {
      throw new BadRequestException(`Unknown stamp: ${stampKey}`);
    }
    const smokeId = await this.currentSmokeId();
    if (!smokeId) {
      throw new ConflictException('No smoke is in progress');
    }
    const reading = await this.latestReading();
    const recorded = await this.create({
      smokeId,
      stampKey: stamp.key,
      label: stamp.label,
      tone: stamp.tone,
      at: new Date(),
      chamberTemp: snapshotReading(reading?.ChamberTemp),
      probe1Temp: snapshotReading(reading?.MeatTemp),
      probe2Temp: snapshotReading(reading?.Meat2Temp),
      probe3Temp: snapshotReading(reading?.Meat3Temp),
    } as Partial<CookEventDocument>);
    await this.announce(smokeId);
    return recorded;
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
   * The newest reading of the cook, or `undefined` when it has taken none —
   * and `undefined` too when the reading could not be read at all. A tap that
   * reached the backend is logged: temperatures nobody could fetch make the
   * entry less informative, while failing the tap makes the pitmaster stand at
   * a hot smoker pressing a button that does nothing.
   */
  private async latestReading(): Promise<Temp | undefined> {
    try {
      return await this.temps.getLatestCurrentTemp();
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
