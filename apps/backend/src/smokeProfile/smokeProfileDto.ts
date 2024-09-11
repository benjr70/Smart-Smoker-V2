import { ApiProperty } from "@nestjs/swagger";

export class SmokeProFileDto {

    @ApiProperty()
    chamberName: string

    @ApiProperty()
    probe1Name: string

    @ApiProperty()
    probe2Name: string

    @ApiProperty()
    probe3Name: string

    @ApiProperty()
    notes: string
    
    @ApiProperty()
    woodType: string;
}