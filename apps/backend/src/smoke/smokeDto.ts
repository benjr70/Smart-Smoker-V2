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
    ratingId?: string;

    @ApiProperty()
    date?: Date

}