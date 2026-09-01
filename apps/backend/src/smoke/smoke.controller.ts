import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe';
import { Smoke } from './smoke.schema';
import { ServePlanDto } from './serve-plan.dto';
import { SmokeDto } from './smokeDto';
import { SmokeService } from './smoke.service';

@ApiTags('Smoke')
@Controller('api/smoke')
export class SmokeController {
  constructor(private readonly smokeService: SmokeService) {}

  @Post()
  CreateSmoke(@Body() smokeDto: SmokeDto): Promise<Smoke> {
    return this.smokeService.create(smokeDto);
  }
  @Get('/all')
  getAllSmoke(): Promise<Smoke[]> {
    return this.smokeService.getAll();
  }

  @Post('/finish')
  FinishSmoke(): Promise<Smoke> {
    return this.smokeService.FinishSmoke();
  }

  /**
   * Set the Serve Plan of the cook in progress: when the food is meant to hit
   * the table, how long the meat rests, or either on its own.
   *
   * On the current cook rather than an id, because a plan is only ever about
   * the session that is running — and answered with the cook as it now stands,
   * so the card that moved a stepper renders what was actually stored rather
   * than what it hoped had been.
   */
  @Put('/current/serve-plan')
  SaveServePlan(@Body() plan: ServePlanDto): Promise<Smoke | null> {
    return this.smokeService.updateServePlan(plan);
  }

  /**
   * Record that the meat of the cook in progress has come off: the moment, and
   * what the watched probe read as it did.
   *
   * A POST because it records something that happened rather than storing
   * something the client decided — the body would have nothing to carry, since
   * both halves of the stamp are the server's to observe. Safe to repeat: the
   * pull is stamped once and every later call answers the cook unchanged, which
   * is what lets a step advance make this call without knowing whether an
   * earlier one already did.
   */
  @Post('/current/pull')
  StampPull(): Promise<Smoke | null> {
    return this.smokeService.stampPull();
  }

  /**
   * The cook in progress — its plan, its pull stamp, its links — or `null`
   * where no session is set up.
   *
   * Declared before the by-id route so `current` is answered here rather than
   * being read as an id and refused as a malformed one.
   */
  @Get('/current')
  getCurrent(): Promise<Smoke | null> {
    return this.smokeService.getCurrentSmoke();
  }

  @Get('/:id')
  getById(@Param('id', ParseObjectIdPipe) id: string): Promise<Smoke> {
    return this.smokeService.getByIdOrThrow(id);
  }

  /**
   * Delete a cook, and with it everything recorded about it: its pre-smoke,
   * smoke profile, temperature series, post-smoke and rating. The cascade runs
   * here rather than in the client so removing a cook is one request the
   * server either carries out or can be asked to carry out again.
   */
  @Delete('/:id')
  DeleteById(@Param('id', ParseObjectIdPipe) id: string) {
    return this.smokeService.deleteDeep(id);
  }
}
