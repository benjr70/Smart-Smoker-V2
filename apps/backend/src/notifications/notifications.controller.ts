import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { Notifications } from './notifications.schema';


export interface PushSubscription {
    endpoint: string;
    expirationTime: number | null;
    keys: {
      p256dh: string;
      auth: string;
    };
  }


@ApiTags('Notifications')
@Controller('api/notifications')
export class NotificationsController {

    constructor(private readonly notificationsService: NotificationsService){
    }
  
    @Post('/subscribe')
    setSubscription(@Body() subscription: PushSubscription): Promise<Notifications>{
        return this.notificationsService.setSubscription(subscription);
    }

}
