import { ApiProperty } from '@nestjs/swagger';

export class RatingsDto {
  @ApiProperty()
  smokeFlavor: number;

  @ApiProperty()
  seasoning: number;

  @ApiProperty()
  tenderness: number;

  @ApiProperty()
  overallTaste: number;

  @ApiProperty()
  notes: string;
}
