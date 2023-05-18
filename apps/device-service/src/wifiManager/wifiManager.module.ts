import { Module } from "@nestjs/common";
import { WifiManagerController } from "./wifiManager.controller";
import { WifiManagerService } from "./wifiManager.service";




@Module({
    controllers: [WifiManagerController],
    providers: [WifiManagerService],
})
export class WifiManagerModule {}