import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HistoryService } from './history.service';
import { SmokeHistory } from './histroyDto';

@ApiTags('History')
@Controller('api/history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  getHistory(): Promise<SmokeHistory[]> {
    return this.historyService.getHistory();
  }
}
