import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class SmokeProFileDto {
  @ApiProperty()
  @IsString()
  chamberName: string;

  @ApiProperty()
  @IsString()
  probe1Name: string;

  @ApiProperty()
  @IsString()
  probe2Name: string;

  @ApiProperty()
  @IsString()
  probe3Name: string;

  @ApiProperty()
  @IsString()
  notes: string;

  @ApiProperty()
  @IsString()
  woodType: string;
}
