import { Injectable } from "@nestjs/common";
import { ReadlineParser, SerialPort } from "serialport";


@Injectable()
export class SerialService {
    
    port: SerialPort;

    constructor(){
         this.port = new SerialPort({
            path: '/dev/ttyUSB0',
            baudRate: 9600,
        });
        this.readSerialPort();
    }

    readSerialPort(){
        const parser = new ReadlineParser();
        this.port.pipe(parser);
        parser.on('data', console.log);
    }
}