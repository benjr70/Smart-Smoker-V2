import { Injectable, Logger } from '@nestjs/common';
import {
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
  } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { StateService } from 'src/State/state.service';
import { TempDto } from 'src/temps/tempDto';
import { TempsService } from 'src/temps/temps.service';

let count = 0;
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})

@Injectable()
export class EventsGateway {

  constructor(
    private tempsService: TempsService,
    private stateService: StateService,
    ){}


  @WebSocketServer()
  server: Server;

  @SubscribeMessage('identity')
  async identity(@MessageBody() data: number): Promise<number> {
    Logger.log(`identity: ${data}`, 'Websocket')
    return data;
  }

  @SubscribeMessage('events')
  handleEvent(@MessageBody() data: string) {
    this.server.emit('events', data)
    count++;
    if(count > 10){
      this.stateService.GetState().then(state => {
        if(state.smoking){
          const tempObj = JSON.parse(data);
          const tempDto: TempDto ={
            MeatTemp: tempObj.probeTemp1,
            Meat2Temp: tempObj.probeTemp2,
            Meat3Temp: tempObj.probeTemp3,
            ChamberTemp: tempObj.chamberTemp,
            date: tempObj.date,
          }
          this.handleTempLogging(tempDto);
          this.tempsService.saveNewTemp(tempDto);
        }
      })
      count = 0
    }
  }

  handleTempLogging(tempDto: TempDto){
    let meatTemp = parseFloat(tempDto.MeatTemp);
    let chamberTemp = parseFloat(tempDto.ChamberTemp)
    if( meatTemp< -30 || chamberTemp  < -30 ){
      Logger.warn(`temps too cold: ${tempDto}`, 'Websocket');
    } else if (isNaN(meatTemp) || isNaN(chamberTemp)) {
      Logger.error(`temps NAN: ${tempDto}`, 'Websocket');
    } else if(  meatTemp > 500 || chamberTemp > 500){
      Logger.warn(`temps too hot: ${tempDto}`, 'Websocket');
    }
  }

  @SubscribeMessage('smokeUpdate')
  handleSmokeUpdate(@MessageBody() data: string) {
    Logger.log(`Update Smoking: ${data}`, 'Websocket')
    this.server.emit('smokeUpdate', data);
  }

  @SubscribeMessage('clear')
  handleClear(@MessageBody() data: string) {
    Logger.log(`Clearing smoke ${data}`, 'Websocket')
    this.server.emit('clear', data);
  }

  @SubscribeMessage('refresh')
  handleRefresh(){
    Logger.log(`refresh smoke`, 'Websocket')
    this.server.emit('refresh');
  }
}