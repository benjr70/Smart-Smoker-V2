import { ApiProperty } from '@nestjs/swagger';

export class PostSmokeDto {
  @ApiProperty()
  restTime: string;

  @ApiProperty()
  steps: string[];

  @ApiProperty()
  notes: string;
}
