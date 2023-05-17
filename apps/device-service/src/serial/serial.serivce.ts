import { Injectable } from "@nestjs/common";
import { Subject } from "rxjs";
import { ReadlineParser, SerialPort } from "serialport";
import { EventsGateway } from "src/websocket/events.gateway";


@Injectable()
export class SerialService {
    
    port: SerialPort;
    private dataSubject: Subject<string> = new Subject<string>();

    constructor(){
         this.port = new SerialPort({
            path: '/dev/ttyUSB0',
            baudRate: 9600,
        });

        const parser = new ReadlineParser();
        this.port.pipe(parser);
        parser.on('data', (data) => {
            const stringData = data.toString('utf-8');
            this.dataSubject.next(stringData);
        });
    }
    

    onData(): Subject<string> {
        return this.dataSubject;
    }
}