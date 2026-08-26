import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe';
import { CookEvent } from './cook-events.schema';
import { CookEventsService } from './cook-events.service';
import { RecordCookEventDto } from './cook-events.dto';

/**
 * The cook log: one route per thing a pitmaster does to it — tap, read, undo.
 *
 * Its own resource rather than a field on the smoke, because an event is
 * written while the cook is running, from whichever screen is to hand, and
 * because both surfaces read the same list back live.
 */
@ApiTags('Cook events')
@Controller('api/cook-events')
export class CookEventsController {
  constructor(private readonly cookEvents: CookEventsService) {}

  /**
   * Log one tap against the cook in progress, at the server's clock and with
   * the pit as the readings last reported it.
   */
  @Post()
  @ApiOkResponse({ type: CookEvent })
  @ApiBadRequestResponse({
    description: 'The stamp key is not in the catalogue.',
  })
  @ApiConflictResponse({ description: 'No smoke is in progress.' })
  record(@Body() dto: RecordCookEventDto): Promise<CookEvent> {
    return this.cookEvents.record(dto.stampKey);
  }

  /**
   * The in-progress cook's log, oldest first — empty when no cook is set up,
   * which is an answer rather than an error.
   *
   * Declared ahead of the by-id route so `current` is not taken for a smoke id.
   */
  @Get('/current')
  @ApiOkResponse({ type: [CookEvent] })
  listCurrent(): Promise<CookEvent[]> {
    return this.cookEvents.listCurrent();
  }

  /** One stored cook's log, oldest first. */
  @Get('/smoke/:smokeId')
  @ApiOkResponse({ type: [CookEvent] })
  listForSmoke(@Param('smokeId') smokeId: string): Promise<CookEvent[]> {
    return this.cookEvents.listForSmoke(smokeId);
  }

  /** Remove one mis-tapped event, so the log stays truthful. */
  @Delete('/:id')
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.cookEvents.remove(id);
  }
}
