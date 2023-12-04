import { ApiProperty } from "@nestjs/swagger";


export class TempDto {
    @ApiProperty()
    MeatTemp: string;

    @ApiProperty()
    Meat2Temp: string;

    @ApiProperty()
    Meat3Temp: string;

    @ApiProperty()
    ChamberTemp: string;

    @ApiProperty()
    tempsId?: string;

    @ApiProperty()
    date?: Date;

}