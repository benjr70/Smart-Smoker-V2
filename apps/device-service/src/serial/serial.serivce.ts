import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { ReadlineParser, SerialPort } from 'serialport';

let NODE_ENV;

// interface for temp data
interface TempData {
  Meat: number;
  Meat2: number;
  Meat3: number;
  Chamber: number;
}

@Injectable()
export class SerialService {
  port: SerialPort;
  private dataSubject: Subject<string> = new Subject<string>();
  private temperatureInterval: NodeJS.Timeout | null = null;

  constructor() {
    NODE_ENV = process.env.NODE_ENV ? process.env.NODE_ENV.trim() : '';

    const parser = new ReadlineParser();
    if (NODE_ENV === 'local') {
      Logger.log('Running in emulator mode', 'SerialService');
      let stringData: TempData = {
        Meat: 0,
        Meat2: 0,
        Meat3: 0,
        Chamber: 0,
      };
      this.temperatureInterval = setInterval(() => {
        stringData = this.generateTempString(stringData);
        this.handleTempLogging(JSON.stringify(stringData));
        this.dataSubject.next(JSON.stringify(stringData));
      }, 500);
    } else {
      Logger.log('Running in production mode', 'SerialService');
      this.port = new SerialPort({
        path: '/dev/ttyS0',
        baudRate: 9600,
      });
      this.port.pipe(parser);
      parser.on('data', (data) => {
        try {
          Logger.debug(`raw data ${data}`, 'SerialService');
          const stringData = data.toString('utf-8');
          // this.handleTempLogging(stringData);
          this.dataSubject.next(stringData);
        } catch (e) {
          Logger.error(e, 'SerialService');
        }
      });
    }
  }

  onDestroy() {
    if (this.temperatureInterval) {
      clearInterval(this.temperatureInterval);
    }
    if (this.port) {
      this.port.close();
    }
  }

  onData(): Subject<string> {
    return this.dataSubject;
  }

  handleTempLogging(tempString: string) {
    const tempObj = JSON.parse(tempString);
    const meatTemp = parseFloat(tempObj.Meat);
    const chamberTemp = parseFloat(tempObj.Chamber);
    if (meatTemp < -30 || chamberTemp < -30) {
      Logger.warn(
        `temps too cold: ${JSON.stringify(tempObj)}`,
        'SerialService',
      );
    } else if (isNaN(meatTemp) || isNaN(chamberTemp)) {
      Logger.error(`temps NAN: ${JSON.stringify(tempObj)}`, 'SerialService');
    } else if (meatTemp > 500 || chamberTemp > 500) {
      Logger.warn(`temps too hot: ${JSON.stringify(tempObj)}`, 'SerialService');
    }
  }

  // function that increase temps based off of input temps
  generateTempString(tempObj: TempData): TempData {
    // if any temp gets above 500, reset to 0
    let newTempObj: TempData;
    if (
      tempObj.Meat > 500 ||
      tempObj.Meat2 > 500 ||
      tempObj.Meat3 > 500 ||
      tempObj.Chamber > 500
    ) {
      newTempObj = {
        Meat: 0,
        Meat2: 0,
        Meat3: 0,
        Chamber: 0,
      };
    } else {
      newTempObj = {
        Meat: tempObj.Meat + 1,
        Meat2: tempObj.Meat2 + 2,
        Meat3: tempObj.Meat3 + 3,
        Chamber: tempObj.Chamber + 4,
      };
    }
    return newTempObj;
  }
}
