import { ApiProperty } from '@nestjs/swagger';

export class SmokeHistory {
  @ApiProperty()
  name: string;
  @ApiProperty()
  meatType: string;
  @ApiProperty()
  weight: string;
  @ApiProperty()
  weightUnit: string;
  @ApiProperty()
  woodType: string;
  @ApiProperty()
  date: string;
  @ApiProperty()
  smokeId: string;
  @ApiProperty()
  overAllRating: string;
}
