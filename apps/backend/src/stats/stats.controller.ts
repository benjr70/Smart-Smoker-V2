import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { StatsDto } from './stats.dto';
import { StatsService } from './stats.service';

@ApiTags('Stats')
@Controller('api/stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  /**
   * The lifetime statistics of the archive, already derived — the screen does
   * no arithmetic of its own.
   */
  @Get()
  @ApiOkResponse({ type: StatsDto })
  getStats(): Promise<StatsDto> {
    return this.statsService.getStats();
  }
}
