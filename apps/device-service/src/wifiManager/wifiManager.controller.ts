import { Body, Controller, Post, Get } from "@nestjs/common";
import { WifiManagerService } from "./wifiManager.service";
import { wifiDto } from "./wifiDto";



@Controller('api/wifiManager')
export class WifiManagerController {

    constructor(private readonly wifiManagerServicer: WifiManagerService){}

    @Post('/connect')
    connectWifi(@Body() dto: wifiDto): Promise<any> {
        return this.wifiManagerServicer.connectToWiFi(dto);
    }

    @Post('/disconnect')
    disconnectWifi(): Promise<any> {
        return this.wifiManagerServicer.disconnectFromWiFi();
    }

    @Get('/connection')
    getConnection(): Promise<any> {
        return this.wifiManagerServicer.getConnection();
    }
}