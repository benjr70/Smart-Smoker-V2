import { ApiProperty } from '@nestjs/swagger';
import { SmokeStatus } from './smoke.schema';

export class SmokeDto {
  @ApiProperty()
  preSmokeId: string;

  @ApiProperty()
  tempsId?: string;

  @ApiProperty()
  postSmokeId?: string;

  @ApiProperty()
  smokeProfileId?: string;

  @ApiProperty()
  ratingId?: string;

  @ApiProperty()
  date?: Date;

  @ApiProperty()
  status: SmokeStatus;
}
