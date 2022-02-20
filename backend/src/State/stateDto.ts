import { ApiProperty } from "@nestjs/swagger";


export class StateDto {
    @ApiProperty()
    smokeId: string;

    @ApiProperty()
    smoking: boolean;
}