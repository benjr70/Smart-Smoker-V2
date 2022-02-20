import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

export type SmokeDocument = Smoke & Document

@Schema()
export class Smoke {
    @Prop()
    preSmokeId: string;

    @Prop()
    tempsId: string

    @Prop()
    postSmoke: string

    @Prop()
    date: Date
}

export const SmokeSchema = SchemaFactory.createForClass(Smoke);