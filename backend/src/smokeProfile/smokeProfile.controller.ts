import { Body, Controller, Get, Post } from "@nestjs/common/decorators";
import { ApiTags } from "@nestjs/swagger";
import { SmokeProfile } from "./smokeProfile.schema";
import { SmokeProfileService } from "./smokeProfile.service";
import { SmokeProFileDto } from "./smokeProfileDto";



@ApiTags('SmokeProfile')
@Controller('api/smokeProfile')
export class SmokeProfileController {

    constructor(private readonly smokeProfileService: SmokeProfileService){
    
    }

    @Get('/current')
    getCurrentSmokeProfile(): Promise<SmokeProfile> {
        return this.smokeProfileService.getCurrentSmokeProfile();
    }

    @Post('/current')
    saveCurrentSmokeProfile(@Body() dto: SmokeProFileDto): Promise<SmokeProfile> {
       return this.smokeProfileService.saveCurrentSmokeProfile(dto);
    }

}