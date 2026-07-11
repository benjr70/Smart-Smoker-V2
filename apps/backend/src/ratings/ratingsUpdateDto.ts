import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { RatingsDto } from './ratingsDto';

/**
 * Body accepted by `POST /api/ratings/:id`. The frontend re-sends the rating it
 * loaded (via `getRatingById`), so the payload carries the persisted `_id` and
 * Mongoose's `__v` alongside the editable fields. They are optional and ignored
 * by the controller; declaring them keeps the global forbidNonWhitelisted pipe
 * from rejecting the update.
 */
export class RatingsUpdateDto extends RatingsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  _id?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  __v?: number;
}
