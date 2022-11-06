import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';


@ApiTags('notifications')
@Controller('api/notifications')
export class NotificationsController {
  
    @Get()
    getNotificationSettings(): string{
        return 'this is a test';
    }


}
