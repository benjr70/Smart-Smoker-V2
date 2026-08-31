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
   *
   * The id is taken as it comes, without the object-id check the sibling routes
   * make: a cook nobody recorded is an empty chart, and a client comparing a
   * list of cooks should not have to tell "no readings" from "that id was not
   * shaped like an id" to draw the same nothing either way. Nothing is cast
   * from it — a series is found by its `tempsId`, which is stored as a plain
   * string — so an unrecognisable id simply matches no readings.
   */
  @Get('/:id/series')
  @ApiOperation({
    summary: "A stored cook's readings, thinned and chart-ready",
  })
  @ApiOkResponse({ type: TempSampleDto, isArray: true })
  getSeriesById(
    @Param('id') id: string,
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
