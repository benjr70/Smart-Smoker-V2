import { Body, Controller, Post } from "@nestjs/common";
import { WifiManagerService } from "./wifiManager.service";
import { wifiDto } from "./wifiDto";



@Controller('api/wifiManager')
export class WifiManagerController {

    constructor(private readonly wifiManagerServicer: WifiManagerService){}

    @Post()
    connectWifi(@Body() dto: wifiDto): Promise<any> {
        return this.wifiManagerServicer.connectToWiFi(dto);
    }

    @Post()
    disconnectWifi(): Promise<any> {
        return this.wifiManagerServicer.disconnectFromWiFi();
    }
}