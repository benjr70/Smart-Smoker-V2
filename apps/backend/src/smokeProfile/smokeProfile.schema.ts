import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";



export type SmokeProFileDocument = SmokeProfile & Document

@Schema()
export class SmokeProfile {

    @Prop()
    chamberName: string

    @Prop()
    probe1Name: string

    @Prop()
    probe2Name: string

    @Prop()
    probe3Name: string

    @Prop()
    notes: string;

    @Prop()
    woodType: string;
}

export const SmokeProFileSchema = SchemaFactory.createForClass(SmokeProfile)