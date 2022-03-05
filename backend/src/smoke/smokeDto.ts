import { ApiProperty } from "@nestjs/swagger";


export class SmokeDto {
    @ApiProperty()
    preSmokeId: string;

    @ApiProperty()
    TempsId?: string;

    @ApiProperty()
    postSmokeId?: string;

}