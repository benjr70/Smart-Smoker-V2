import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

export class RatingsDto {
  @ApiProperty()
  @IsNumber()
  smokeFlavor: number;

  @ApiProperty()
  @IsNumber()
  seasoning: number;

  @ApiProperty()
  @IsNumber()
  tenderness: number;

  @ApiProperty()
  @IsNumber()
  overallTaste: number;

  @ApiProperty()
  @IsString()
  notes: string;
}
