import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

export type TempDocument = Temp & Document

@Schema()
export class Temp {
    @Prop()
    MeatTemp: string;

    @Prop()
    ChamberTemp: string;

    @Prop()
    tempsId: string

    @Prop()
    date: Date
}

export const TempSchema = SchemaFactory.createForClass(Temp);