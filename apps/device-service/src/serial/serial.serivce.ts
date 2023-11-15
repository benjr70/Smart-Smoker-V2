import { Injectable, Logger } from "@nestjs/common";
import { Subject } from "rxjs";
import { ReadlineParser, SerialPort } from "serialport";


@Injectable()
export class SerialService {
    
    port: SerialPort;
    private dataSubject: Subject<string> = new Subject<string>();

    constructor(){
         this.port = new SerialPort({
            path: '/dev/ttyS0',
            baudRate: 9600,
        });

        const parser = new ReadlineParser();
        this.port.pipe(parser);
        parser.on('data', (data) => {
            const stringData = data.toString('utf-8');
            this.handleTempLogging(stringData);
            this.dataSubject.next(stringData);
        });
    }
    

    onData(): Subject<string> {
        return this.dataSubject;
    }


    handleTempLogging(tempString: string){
      const tempObj = JSON.parse(tempString);
      let meatTemp = parseFloat(tempObj.Meat);
      let chamberTemp = parseFloat(tempObj.Chamber)
      if( meatTemp< -30 || chamberTemp  < -30 ){
        Logger.warn(`temps too cold: ${JSON.stringify(tempObj)}`, 'Websocket');
      } else if (isNaN(meatTemp) || isNaN(chamberTemp)) {
        Logger.error(`temps NAN: ${JSON.stringify(tempObj)}`, 'Websocket');
      } else if(  meatTemp > 500 || chamberTemp > 500){
        Logger.warn(`temps too hot: ${JSON.stringify(tempObj)}`, 'Websocket');
      }
    }
}