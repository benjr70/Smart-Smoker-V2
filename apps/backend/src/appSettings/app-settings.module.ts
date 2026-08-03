import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppSettingsController } from './app-settings.controller';
import {
  ApplicationSettings,
  ApplicationSettingsSchema,
} from './app-settings.schema';
import { AppSettingsService } from './app-settings.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: ApplicationSettings.name,
        schema: ApplicationSettingsSchema,
        // The collection keeps the name it had while this document was
        // notification-scoped. Generalising the document is a rename, not a
        // reset: an installation that had already configured its chamber alert
        // keeps it, and only the route and the shape around it changed.
        collection: 'notificationsettings',
      },
    ]),
  ],
  controllers: [AppSettingsController],
  providers: [AppSettingsService],
  exports: [AppSettingsService],
})
export class AppSettingsModule {}
