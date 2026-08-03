import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApplicationSettingsDto } from './app-settings.dto';
import { ApplicationSettings } from './app-settings.schema';
import { AppSettingsService } from './app-settings.service';
import { ResolvedApplicationSettings } from './probe-names';

/**
 * The installation's settings.
 *
 * Application-scoped rather than notification-scoped: the document carries the
 * appearance every client renders in as well as the chamber alert, and a browser
 * asking what colour to paint has no business posting to a notifications
 * endpoint.
 */
@ApiTags('Application settings')
@Controller('api/appSettings')
export class AppSettingsController {
  constructor(private readonly appSettingsService: AppSettingsService) {}

  /**
   * The current settings, always a complete document: a deployment that has
   * never saved (or that still holds the deleted rule shape, which is not
   * migrated) reads as defaults rather than as an error.
   *
   * Each probe row carries the name the active cook gives that slot. The names
   * are served, never stored — the save DTO rejects them — because a slot's name
   * belongs to what is cooking rather than to the setting.
   */
  @Get()
  getSettings(): Promise<ResolvedApplicationSettings> {
    return this.appSettingsService.getResolvedSettings();
  }

  /**
   * Save the blocks in the body, leaving the rest of the document alone. An
   * upsert, so the first client to choose an appearance on a fresh installation
   * does not have to create the document first.
   */
  @Post()
  setSettings(
    @Body() settings: ApplicationSettingsDto,
  ): Promise<ApplicationSettings> {
    // The validated body is exactly the settings blocks — it carries only
    // user-owned fields, so it goes to the schema-typed service unchanged.
    return this.appSettingsService.saveSettings(
      settings as unknown as Partial<ApplicationSettings>,
    );
  }
}
