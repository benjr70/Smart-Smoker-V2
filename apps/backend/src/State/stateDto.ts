import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString } from 'class-validator';

export class StateDto {
  @ApiProperty()
  @IsString()
  smokeId: string;

  @ApiProperty()
  @IsBoolean()
  smoking: boolean;
}
