import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class PostSmokeDto {
  @ApiProperty()
  @IsString()
  restTime: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  steps: string[];

  @ApiProperty()
  @IsString()
  notes: string;
}
