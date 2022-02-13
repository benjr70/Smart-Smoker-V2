
import { ApiProperty } from "@nestjs/swagger";

export class Weight {
    @ApiProperty()
    unit: string;
    @ApiProperty()
    weight: number
}

export class PreSmokeDto {
    @ApiProperty()
    id: string;
    @ApiProperty()
    name: string
    @ApiProperty()
    meatType: string;
    @ApiProperty()
    weight: Weight
    @ApiProperty()
    steps: string[]
    @ApiProperty()
    notes: string
}
