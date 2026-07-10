import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';

export class Weight {
  @ApiProperty()
  @IsString()
  unit: string;
  @ApiProperty()
  @IsNumber()
  weight: number;
}

export class PreSmokeDto {
  @ApiProperty()
  @IsString()
  name: string;
  @ApiProperty()
  @IsString()
  meatType: string;
  @ApiProperty({ type: Weight })
  @ValidateNested()
  @Type(() => Weight)
  weight: Weight;
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  steps: string[];
  @ApiProperty()
  @IsString()
  notes: string;
}
