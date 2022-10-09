import { Injectable } from '@nestjs/common';
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
            MeatTemp: tempObj.meatTemp,
            ChamberTemp: tempObj.chamberTemp,
            date: tempObj.date,
          }
          this.tempsService.saveNewTemp(tempDto);
        }
      })
      count = 0
    }
  }

  @SubscribeMessage('smokeUpdate')
  handleSmokeUpdate(@MessageBody() data: string) {
    this.server.emit('smokeUpdate', data)
  }

  @SubscribeMessage('clear')
  handleClear(@MessageBody() data: string) {
    this.server.emit('clear', data)
  }
}