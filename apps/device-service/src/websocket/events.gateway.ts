import { Injectable } from '@nestjs/common';
import {
    WebSocketGateway,
    WebSocketServer,
  } from '@nestjs/websockets';
  import { Server } from 'socket.io';
import { SerialService } from '../serial/serial.serivce';



@WebSocketGateway({
    cors: {
      origin: '*',
    },
  })

  @Injectable()
  export class EventsGateway {

    @WebSocketServer()
    server: Server;

    constructor(private readonly serialService: SerialService){}

    afterInit(){
      this.serialService.onData().subscribe((data) => {
        this.server.emit('temp', data)
      })
    }

  }

