import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";



export type SmokeProFileDocument = SmokeProfile & Document

@Schema()
export class SmokeProfile {
    @Prop()
    notes: string;

    @Prop()
    woodType: string;
}

export const SmokeProFileSchema = SchemaFactory.createForClass(SmokeProfile)