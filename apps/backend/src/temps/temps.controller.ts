import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe';
import { TempDto } from './tempDto';
import { TempSample } from './temp-series';
import { TempSampleDto, TempSeriesQueryDto } from './temp-series.dto';
import { Temp } from './temps.schema';
import { TempsService } from './temps.service';

@ApiTags('Temps')
@Controller('api/temps')
export class TempsController {
  constructor(private readonly tempsService: TempsService) {}

  @Post()
  saveNewTemp(@Body() dto: TempDto) {
    return this.tempsService.saveNewTemp(dto);
  }

  @Get()
  getAllTempsCurrent(): Promise<Temp[]> {
    return this.tempsService.getAllTempsCurrent();
  }

  @Get('/:id')
  getAllTempsById(@Param('id', ParseObjectIdPipe) id: string): Promise<Temp[]> {
    return this.tempsService.getAllTempsById(id);
  }

  /**
   * A stored cook as a chart draws it: numbers rather than the strings the
   * device sent, thinned to a size that fits in one response, instead of the
   * tens of thousands of raw readings a long cook holds.
   */
  @Get('/:id/series')
  @ApiOperation({
    summary: "A stored cook's readings, thinned and chart-ready",
  })
  @ApiOkResponse({ type: TempSampleDto, isArray: true })
  getSeriesById(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() query: TempSeriesQueryDto,
  ): Promise<TempSample[]> {
    return this.tempsService.getSeriesById(id, query.points);
  }

  @Post('/batch')
  saveTempBatch(@Body() dto: TempDto[]) {
    return this.tempsService.saveTempBatch(dto);
  }

  @Delete('/:id')
  DeleteById(@Param('id', ParseObjectIdPipe) id: string) {
    return this.tempsService.delete(id);
  }
}
