import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { NotificationSubscription } from './notificationSubscription.schema';
import { NotificationSettings } from './notificationSettings.schema';

@ApiTags('Notifications')
@Controller('api/notifications')
export class NotificationsController {

    constructor(private readonly notificationsService: NotificationsService){
    }
  
    @Post('/subscribe')
    setSubscription(@Body() subscription: NotificationSubscription): Promise<NotificationSubscription>{
        return this.notificationsService.setSubscription(subscription);
    }

    @Post('/settings')
    setSettings(@Body() settings: NotificationSettings): Promise<NotificationSettings>{
        return this.notificationsService.setSettings(settings);
    }

    @Get('/settings')
    getSettings(): Promise<NotificationSettings>{
        return this.notificationsService.getSettings();
    }

}
