import { Body, Controller, Get, Param, Post } from "@nestjs/common/decorators";
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

    @Get('/:id')
    getSmokeProfileById(@Param('id') id: string): Promise<SmokeProfile> {
        return this.smokeProfileService.getById(id);
    }

    @Post('/current')
    saveCurrentSmokeProfile(@Body() dto: SmokeProFileDto): Promise<SmokeProfile> {
       return this.smokeProfileService.saveCurrentSmokeProfile(dto);
    }

}