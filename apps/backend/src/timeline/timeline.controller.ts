import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe';
import { SmokeTimeline } from './timeline.dto';
import { TimelineService } from './timeline.service';

/**
 * A cook's timing, read on its own.
 *
 * Its own route rather than fields on the smoke document, because none of it is
 * stored on one: duration and the peaks are read out of the temperature series
 * every time they are asked for. The review screen composes it alongside the
 * five child documents it already fetches in parallel, so the extra read costs
 * that screen nothing.
 */
@ApiTags('Timeline')
@Controller('api/timeline')
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  @Get('/:id')
  @ApiOkResponse({ type: SmokeTimeline })
  getTimeline(
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<SmokeTimeline> {
    return this.timelineService.getTimeline(id);
  }
}
