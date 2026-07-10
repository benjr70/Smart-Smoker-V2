import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';

export class TempDto {
  @ApiProperty()
  @IsString()
  MeatTemp: string;

  @ApiProperty()
  @IsString()
  Meat2Temp: string;

  @ApiProperty()
  @IsString()
  Meat3Temp: string;

  @ApiProperty()
  @IsString()
  ChamberTemp: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  tempsId?: string;

  @ApiProperty()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;
}
