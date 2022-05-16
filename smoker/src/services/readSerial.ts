import { SerialPort } from 'serialport';

export const readTemp = () => {

    const port = new SerialPort({
        path: '/dev/ttyUSB0',
        baudRate: 9600,
    });

    
}