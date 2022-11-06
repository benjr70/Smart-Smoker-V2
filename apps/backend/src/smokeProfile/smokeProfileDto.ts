import { ApiProperty } from "@nestjs/swagger";

export class SmokeProFileDto {
    @ApiProperty()
    notes: string
    
    @ApiProperty()
    woodType: string;
}