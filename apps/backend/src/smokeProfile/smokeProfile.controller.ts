import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common/decorators';
import { ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe';
import { SmokeProfile } from './smokeProfile.schema';
import { SmokeProfileService } from './smokeProfile.service';
import { SmokeProFileDto } from './smokeProfileDto';

@ApiTags('SmokeProfile')
@Controller('api/smokeProfile')
export class SmokeProfileController {
  constructor(private readonly smokeProfileService: SmokeProfileService) {}

  @Get('/current')
  getCurrentSmokeProfile(): Promise<SmokeProfile> {
    return this.smokeProfileService.getCurrentSmokeProfile();
  }

  @Get('/:id')
  getSmokeProfileById(
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<SmokeProfile> {
    return this.smokeProfileService.getByIdOrThrow(id);
  }

  @Post('/current')
  saveCurrentSmokeProfile(@Body() dto: SmokeProFileDto): Promise<SmokeProfile> {
    return this.smokeProfileService.saveCurrentSmokeProfile(dto);
  }

  @Delete('/:id')
  DeleteById(@Param('id', ParseObjectIdPipe) id: string) {
    return this.smokeProfileService.delete(id);
  }
}
