import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Settings } from './settings.schema';
import { SettingsService } from './settings.service';
import { CreateSettingsDto } from './settingsDto';

@ApiTags('settings')
@Controller('api/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings(): Promise<Settings[]> {
    return this.settingsService.findAll();
  }

  @Post()
  SetSettings(@Body() dto: CreateSettingsDto): Promise<Settings> {
    return this.settingsService.create(dto);
  }
}
