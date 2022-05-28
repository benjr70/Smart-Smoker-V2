import { SerialPort } from 'serialport';

export const readTemp = (): SerialPort<any> => {

    const port = new SerialPort({
        path: '/dev/ttyUSB0',
        baudRate: 9600,
    });

    return port;
}