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

  /** Empty body when there was no smoke in progress to finish. */
  @Post('/finish')
  FinishSmoke(): Promise<Smoke | null> {
    return this.smokeService.FinishSmoke();
  }

  @Get('/:id')
  getById(@Param('id', ParseObjectIdPipe) id: string): Promise<Smoke> {
    return this.smokeService.getByIdOrThrow(id);
  }

  @Delete('/:id')
  DeleteById(@Param('id', ParseObjectIdPipe) id: string) {
    return this.smokeService.delete(id);
  }
}
