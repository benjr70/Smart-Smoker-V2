import { Injectable, Logger } from '@nestjs/common';
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
import { TempDto } from '../temps/tempDto';
import { TempsService } from '../temps/temps.service';

/**
 * One temperature row is persisted per this many websocket messages. The device
 * is far chattier than the series needs to be; this is the sampling rate the
 * stored graph has always had.
 */
const MESSAGES_PER_STORED_READING = 11;

/**
 * The event a changed appearance preference rides on.
 *
 * Restated by every client that listens for it rather than imported from here —
 * this service ships as `dist/main.js` beside no copy of itself, exactly as the
 * four events already on this gateway are restated in the socket adapters that
 * speak to it.
 */
export const APPEARANCE_EVENT = 'appearance';

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

  constructor(
    private tempsService: TempsService,
    private stateService: StateService,
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
   * hottest path in the application and it touches the database twice — once
   * to read the state, once to store the reading — so an unattended rejection
   * from either is a process-level crash. Awaiting hands the promise to Nest,
   * and the try/catch around each call means neither a missing state document
   * nor an unreachable database can stop temperatures flowing to the clients:
   * the emit above has already happened either way, and losing one sampled
   * reading is worth vastly less than the backend staying up.
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
    } catch (err) {
      this.logDatabaseFailure('could not store reading', err);
    }
  }

  /**
   * Report a database failure on the relay path without rethrowing. Shared by
   * the state read and the temperature write so both report identically.
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
