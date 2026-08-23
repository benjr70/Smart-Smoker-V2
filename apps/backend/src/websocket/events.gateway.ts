import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { State } from '../State/state.schema';
import { StateService } from '../State/state.service';
import { AppearancePreference } from '../appSettings/appearance';
import { StaleCookService } from '../staleCook/stale-cook.service';
import { TempDto } from '../temps/tempDto';
import { TempsService } from '../temps/temps.service';

/**
 * One temperature row is persisted per this many websocket messages. The device
 * is far chattier than the series needs to be; this is the sampling rate the
 * stored graph has always had.
 */
const MESSAGES_PER_STORED_READING = 11;

/**
 * The shortest gap that could possibly mean an abandoned cook.
 *
 * One hour is the smallest idle threshold the application settings will accept,
 * so a reading arriving less than an hour after the one this gateway last
 * stored cannot be crossing any configured threshold, whatever the operator set
 * it to. That makes it safe to answer "not stale" from memory and leave the
 * store alone — which is the point, since the alternative is a query per stored
 * reading for the whole of every cook. Anything longer than this, and after a
 * restart when nothing is remembered, goes and asks {@link StaleCookService},
 * which reads the real threshold and the indexed newest reading.
 */
const MIN_IDLE_THRESHOLD_MS = 60 * 60 * 1000;

/**
 * The event a changed appearance preference rides on.
 *
 * Restated by every client that listens for it rather than imported from here —
 * this service ships as `dist/main.js` beside no copy of itself, exactly as the
 * four events already on this gateway are restated in the socket adapters that
 * speak to it.
 */
export const APPEARANCE_EVENT = 'appearance';

/**
 * The `smokeUpdate` frame: whether the cook is running, and what its four
 * probes are called.
 *
 * Restated here for the same reason {@link APPEARANCE_EVENT} is — this service
 * ships beside no copy of the client packages — and it is exactly the five
 * fields, in the order, that every client already sends and applies. The names
 * travel with the flag because the apps apply the whole frame; a frame missing
 * them would relabel the screen it arrived at.
 */
export interface SmokeUpdateFrame {
  smoking: boolean;
  chamberName: string;
  probe1Name: string;
  probe2Name: string;
  probe3Name: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class EventsGateway {
  // Per-instance rather than module-level: the sampling rate belongs to the
  // gateway, and a module-level counter leaks between instances.
  private messagesSinceStore = 0;

  /**
   * Server clock of the last reading this instance stored, or `null` when it
   * has stored none — which is what a freshly started backend holds, and what
   * an auto-stop resets it to. Null means "ask the store", so a restart in the
   * middle of the gap still notices the gap.
   */
  private lastStoredAt: Date | null = null;

  constructor(
    private tempsService: TempsService,
    private stateService: StateService,
    /**
     * Forward-referenced because the dependency runs both ways: the stale-cook
     * service announces the stop it makes over this gateway, and this gateway
     * asks it whether the arriving reading has crossed a gap. Nest resolves
     * both ends lazily; the modules do the same to each other.
     */
    @Inject(forwardRef(() => StaleCookService))
    private staleCook: StaleCookService,
  ) {}

  @WebSocketServer()
  server: Server;

  @SubscribeMessage('identity')
  async identity(@MessageBody() data: number): Promise<number> {
    Logger.log(`identity: ${data}`, 'Websocket');
    return data;
  }

  /**
   * Relay one device reading to every client, and persist every eleventh one.
   *
   * `async` rather than floating `.then()`s on purpose: the relay is the
   * hottest path in the application and it reaches the database up to three
   * times — to read the state, to check the cook has not been abandoned, and to
   * store the reading — so an unattended rejection from any of them is a
   * process-level crash. Awaiting hands the promise to Nest, and the try/catch
   * around each call means neither a missing state document nor an unreachable
   * database can stop temperatures flowing to the clients: the emit above has
   * already happened either way, and losing one sampled reading is worth vastly
   * less than the backend staying up.
   *
   * A reading that arrives after a long silence ends the cook instead of
   * joining it. Firing the box up weeks later used to append to whatever
   * session was still marked as smoking, and that session's duration is read
   * from the ends of its series; the trigger drops the reading it arrived on so
   * the stopped cook keeps the shape it really had.
   */
  @SubscribeMessage('events')
  async handleEvent(@MessageBody() data: string): Promise<void> {
    this.server.emit('events', data);
    this.messagesSinceStore++;
    if (this.messagesSinceStore < MESSAGES_PER_STORED_READING) {
      return;
    }
    // Reset before awaiting, not after: messages that arrive while the state
    // read is in flight must count toward the next reading, not re-trigger
    // this one.
    this.messagesSinceStore = 0;

    let state: State | undefined;
    try {
      state = await this.stateService.GetState();
    } catch (err) {
      this.logDatabaseFailure(
        'could not read state, skipping stored reading',
        err,
      );
      return;
    }

    // No state document at all means no cook is in progress: a fresh install
    // has an empty `states` collection until something writes one.
    if (!state?.smoking) {
      return;
    }

    const now = new Date();
    if (await this.stoppedStaleCook(now)) {
      return;
    }

    const tempObj = JSON.parse(data);
    const tempDto: TempDto = {
      MeatTemp: tempObj.probeTemp1,
      Meat2Temp: tempObj.probeTemp2,
      Meat3Temp: tempObj.probeTemp3,
      ChamberTemp: tempObj.chamberTemp,
      date: tempObj.date,
    };
    this.handleTempLogging(tempDto);
    try {
      await this.tempsService.saveNewTemp(tempDto);
      this.lastStoredAt = now;
    } catch (err) {
      this.logDatabaseFailure('could not store reading', err);
    }
  }

  /**
   * Decide whether this reading arrived into a cook that is over, ending it if
   * so — `true` when the caller must not store the reading.
   *
   * Most sampled readings answer from memory: see {@link MIN_IDLE_THRESHOLD_MS}
   * for why a recent store is proof enough that nothing is stale. The rest ask
   * the one service that owns the decision, which reads the configured
   * threshold and the newest stored reading for itself.
   *
   * A check that throws is not allowed to cost the reading. The relay has
   * already emitted it, and dropping the store as well would punish a live cook
   * for a database blip on a check that exists to tidy up a dead one; the
   * caller falls through to the save it would have done before this existed.
   */
  private async stoppedStaleCook(now: Date): Promise<boolean> {
    if (
      this.lastStoredAt &&
      now.getTime() - this.lastStoredAt.getTime() < MIN_IDLE_THRESHOLD_MS
    ) {
      return false;
    }
    try {
      const stopped = await this.staleCook.autoStopIfStale(now);
      if (!stopped) {
        return false;
      }
      // Nothing is remembered about a cook that has ended: the next reading
      // starts a new one, and has to consult the store to place itself.
      this.lastStoredAt = null;
      Logger.log(
        `Reading arrived ${stopped.idleHours.toFixed(
          1,
        )}h after the last one; smoke ${
          stopped.smokeId
        } was auto-stopped and the reading dropped`,
        'Websocket',
      );
      return true;
    } catch (err) {
      this.logDatabaseFailure('could not check for an abandoned cook', err);
      return false;
    }
  }

  /**
   * Report a database failure on the relay path without rethrowing. Shared by
   * the state read, the staleness check and the temperature write so all three
   * report identically.
   */
  private logDatabaseFailure(what: string, err: unknown): void {
    Logger.error(
      `${what}: ${err instanceof Error ? err.message : String(err)}`,
      'Websocket',
    );
  }

  handleTempLogging(tempDto: TempDto) {
    const meatTemp = parseFloat(tempDto.MeatTemp);
    const chamberTemp = parseFloat(tempDto.ChamberTemp);
    if (meatTemp < -30 || chamberTemp < -30) {
      Logger.warn(`temps too cold: ${tempDto}`, 'Websocket');
    } else if (isNaN(meatTemp) || isNaN(chamberTemp)) {
      Logger.error(`temps NAN: ${tempDto}`, 'Websocket');
    } else if (meatTemp > 500 || chamberTemp > 500) {
      Logger.warn(`temps too hot: ${tempDto}`, 'Websocket');
    }
  }

  @SubscribeMessage('smokeUpdate')
  handleSmokeUpdate(@MessageBody() data: string) {
    Logger.log(`Update Smoking: ${data}`, 'Websocket');
    this.server.emit('smokeUpdate', data);
  }

  /**
   * Tell every connected client that the backend itself changed the smoking
   * flag.
   *
   * Server-initiated, unlike {@link handleSmokeUpdate}, which relays a flip a
   * client made. The apps hold the flag in memory and learn of changes only
   * from this event, and their Stop button is a toggle over what they hold: a
   * client that never heard the backend switch smoking off would flip it back
   * on and restart a cook that was ended. Sent on the same event a client's own
   * flip rides, so nothing on the receiving side has to learn a new frame.
   */
  broadcastSmokeUpdate(update: SmokeUpdateFrame): void {
    Logger.log(`Smoking is now ${update.smoking}`, 'Websocket');
    this.server.emit('smokeUpdate', update);
  }

  @SubscribeMessage('clear')
  handleClear(@MessageBody() data: string) {
    Logger.log(`Clearing smoke ${data}`, 'Websocket');
    this.server.emit('clear', data);
  }

  /**
   * Tell every connected client how the installation now looks.
   *
   * Server-initiated rather than a handled message: the preference changes
   * because something wrote it over the API, and no client is entitled to
   * announce an appearance the backend has not stored. Clients that were not
   * connected when it happened miss the announcement and read the stored
   * preference on their next load, as they always have.
   */
  broadcastAppearance(preference: AppearancePreference): void {
    Logger.log(
      `Appearance is now ${preference.mode} (${preference.resolvedMode})`,
      'Websocket',
    );
    this.server.emit(APPEARANCE_EVENT, preference);
  }

  @SubscribeMessage('refresh')
  handleRefresh() {
    Logger.log(`refresh smoke`, 'Websocket');
    this.server.emit('refresh');
  }
}
