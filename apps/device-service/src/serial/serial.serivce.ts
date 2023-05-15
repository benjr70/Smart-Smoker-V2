import { Injectable } from "@nestjs/common";
import { ReadlineParser, SerialPort } from "serialport";
import { EventsGateway } from "src/websocket/events.gateway";


@Injectable()
export class SerialService {
    
    port: SerialPort;

    constructor(
        private eventsGateway: EventsGateway
    ){
         this.port = new SerialPort({
            path: '/dev/ttyUSB0',
            baudRate: 9600,
        });
        this.readSerialPort();
    }

    readSerialPort(){
        const parser = new ReadlineParser();
        this.port.pipe(parser);
        parser.on('data', this.eventsGateway.handleSmokeUpdate);
    }
}