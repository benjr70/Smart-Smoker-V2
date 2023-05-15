import { Injectable } from '@nestjs/common';
import {
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
  } from '@nestjs/websockets';
  import { Server } from 'socket.io';



@WebSocketGateway({
    cors: {
      origin: '*',
    },
  })

  @Injectable()
  export class EventsGateway {

    @WebSocketServer()
    server: Server;


    @SubscribeMessage('temp')
    handleSmokeUpdate(@MessageBody() data: string) {
      this.server.emit('temp', data);
    }
  }

