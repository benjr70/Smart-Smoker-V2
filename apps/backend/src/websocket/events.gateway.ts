import { Injectable, Logger } from '@nestjs/common';
import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { StateService } from '../State/state.service';
import { TempDto } from '../temps/tempDto';
import { TempsService } from '../temps/temps.service';

/**
 * One temperature row is persisted per this many websocket messages. The device
 * is far chattier than the series needs to be; this is the sampling rate the
 * stored graph has always had.
 */
const MESSAGES_PER_STORED_READING = 11;

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

  @SubscribeMessage('events')
  handleEvent(@MessageBody() data: string) {
    this.server.emit('events', data);
    this.messagesSinceStore++;
    if (this.messagesSinceStore >= MESSAGES_PER_STORED_READING) {
      this.stateService.GetState().then((state) => {
        if (state.smoking) {
          const tempObj = JSON.parse(data);
          const tempDto: TempDto = {
            MeatTemp: tempObj.probeTemp1,
            Meat2Temp: tempObj.probeTemp2,
            Meat3Temp: tempObj.probeTemp3,
            ChamberTemp: tempObj.chamberTemp,
            date: tempObj.date,
          };
          this.handleTempLogging(tempDto);
          this.tempsService.saveNewTemp(tempDto);
        }
      });
      this.messagesSinceStore = 0;
    }
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

  @SubscribeMessage('refresh')
  handleRefresh() {
    Logger.log(`refresh smoke`, 'Websocket');
    this.server.emit('refresh');
  }
}
