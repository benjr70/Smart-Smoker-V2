import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe';
import { RatingsService } from './ratings.service';
import { Ratings } from './ratings.schema';
import { RatingsDto } from './ratingsDto';
import { RatingsUpdateDto } from './ratingsUpdateDto';

@ApiTags('Ratings')
@Controller('api/ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Get('')
  getCurrentRatings(): Promise<Ratings> {
    return this.ratingsService.getCurrentRating();
  }

  @Post('')
  saveCurrentRatings(@Body() dto: RatingsDto): Promise<Ratings> {
    return this.ratingsService.saveCurrentRatings(dto);
  }

  @Post('/:id')
  updateRatings(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: RatingsUpdateDto,
  ): Promise<Ratings> {
    // Persist only the editable fields. The client echoes back the whole rating
    // it loaded (including _id/__v); $set-ing the immutable _id fails and __v
    // must not be hand-updated, so rebuild the payload explicitly.
    const rating: RatingsDto = {
      smokeFlavor: dto.smokeFlavor,
      seasoning: dto.seasoning,
      tenderness: dto.tenderness,
      overallTaste: dto.overallTaste,
      notes: dto.notes,
    };
    return this.ratingsService.update(id, rating);
  }

  @Get('/:id')
  getRatingById(@Param('id', ParseObjectIdPipe) id: string): Promise<Ratings> {
    return this.ratingsService.getByIdOrThrow(id);
  }

  @Delete('/:id')
  DeleteById(@Param('id', ParseObjectIdPipe) id: string) {
    return this.ratingsService.delete(id);
  }
}
