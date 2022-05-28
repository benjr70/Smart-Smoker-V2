import {  SerialPort } from 'serialport'

export const readTemp = (): SerialPort<any> => {

    const ReadLine = require('@serialport/parser-readline');
    const port = new SerialPort({
        path: '/dev/ttyUSB0',
        baudRate: 9600,
    });

    const parser = new ReadLine();
    return port.pipe(parser);
}