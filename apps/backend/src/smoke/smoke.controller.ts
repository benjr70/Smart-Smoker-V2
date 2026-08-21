import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe';
import { Smoke } from './smoke.schema';
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
