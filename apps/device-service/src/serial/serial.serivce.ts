import { Injectable, Logger } from "@nestjs/common";
import { Subject } from "rxjs";
import { ReadlineParser, SerialPort } from "serialport";


let NODE_ENV

// interface for temp data
interface TempData {
  Meat?: number;
  Meat2?: number;
  Meat3?: number;
  Chamber?: number;
}

@Injectable()
export class SerialService {
    
    port: SerialPort;
    private dataSubject: Subject<TempData> = new Subject<TempData>();

    constructor(){
        NODE_ENV = process.env.NODE_ENV ? process.env.NODE_ENV.trim() : '';


        const parser = new ReadlineParser();
        if(NODE_ENV === 'local'){
          Logger.log('Running in emulator mode', 'SerialService');
          let mockTempData: TempData = {
            Meat: 0,
            Meat2: 0,
            Meat3: 0,
            Chamber: 0,
          };
          setInterval(() => {
            mockTempData = JSON.parse(this.generateTemp(mockTempData));
            this.handleBadTemps(mockTempData);
            this.dataSubject.next(mockTempData);
          }, 500);
        } else {
          Logger.log('Running in production mode', 'SerialService');
          this.port = new SerialPort({
            path: '/dev/ttyS0',
            baudRate: 9600,
          });
          this.port.pipe(parser);
          parser.on('data', (data) => {
              const stringData: TempData = JSON.parse(data.toString('utf-8'));
              this.handleBadTemps(stringData);
              this.dataSubject.next(stringData);
          });
      }
    }
    

    onData(): Subject<TempData> {
        return this.dataSubject;
    }


    handleBadTemps(tempObj: TempData){
      // let meatTemp = tempObj.Meat;
      // let chamberTemp = tempObj.Chamber;
      // if( meatTemp< -30 || chamberTemp  < -30 ){
      //   Logger.warn(`temps too cold or unplugged: ${JSON.stringify(tempObj)}`, 'SerialService');
      // } else if (isNaN(meatTemp) || isNaN(chamberTemp)) {
      //   Logger.error(`temps NAN or unplugged: ${JSON.stringify(tempObj)}`, 'SerialService');
      // } else if(  meatTemp > 500 || chamberTemp > 500){
      //   Logger.warn(`temps too hot or unplugged: ${JSON.stringify(tempObj)}`, 'SerialService');
      // }

      if(tempObj.Chamber > 500){
        Logger.warn(`Chamber temp of ${tempObj.Chamber} is to hot`);
        tempObj.Chamber = undefined;
      } else if(tempObj.Chamber < -30) {
        Logger.warn(`Chamber temp of ${tempObj.Chamber} is to cold`);
        tempObj.Chamber = undefined;
      }
      
      if(tempObj.Meat > 500){
        Logger.warn(`Meat temp of ${tempObj.Meat} is to hot`);
        tempObj.Meat = undefined;
      } else if(tempObj.Meat < -30) {
        Logger.warn(`Meat temp of ${tempObj.Meat} is to cold`);
        tempObj.Meat = undefined;
      }

      if(tempObj.Meat2 > 500){
        Logger.warn(`Meat2 temp of ${tempObj.Meat2} is to hot`);
        tempObj.Meat2 = undefined;
      } else if(tempObj.Meat2 < -30) {
        Logger.warn(`Meat2 temp of ${tempObj.Meat2} is to cold`);
        tempObj.Meat2 = undefined;
      }

      if(tempObj.Meat3 > 500){
        Logger.warn(`Meat3 temp of ${tempObj.Meat3} is to hot`);
        tempObj.Meat3 = undefined;
      } else if(tempObj.Meat3 < -30) {
        Logger.warn(`Meat3 temp of ${tempObj.Meat3} is to cold`);
        tempObj.Meat3 = undefined;
      }

    }


    // function that increase temps based off of input temps 
    generateTemp(tempObj: TempData): string {
      // if any temp gets above 500, reset to 0
      let newTempObj: TempData;
      // if(tempObj.Meat > 500 || tempObj.Meat2 > 500 || tempObj.Meat3 > 500 || tempObj.Chamber > 500){
      //   newTempObj = {
      //     Meat: 0,
      //     Meat2: 0,
      //     Meat3: 0,
      //     Chamber: 0,
      //   }
      // } else {
         newTempObj = {
            Meat: 650,// tempObj.Meat + 1,
            Meat2: tempObj.Meat2 + 2,
            Meat3: tempObj.Meat3 + 3,
            Chamber: tempObj.Chamber + 4,
          }
        // }
      return JSON.stringify(newTempObj);
    }

}