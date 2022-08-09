import { ApiProperty } from "@nestjs/swagger";


export class TempDto {
    @ApiProperty()
    MeatTemp: string;

    @ApiProperty()
    ChamberTemp: string;

    @ApiProperty()
    TempsId?: string;

}