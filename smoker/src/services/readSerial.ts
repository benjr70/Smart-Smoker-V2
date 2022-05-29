import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline'

export const readTemp = (): any => {


    const port = new SerialPort( {
        path: '/dev/ttyUSB0',
        baudRate: 9600,
    });

    const parser = new ReadlineParser();
    return port.pipe(parser);
}