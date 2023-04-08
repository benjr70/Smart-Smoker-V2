import { ApiProperty } from "@nestjs/swagger";


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
    date?: Date

}

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

}