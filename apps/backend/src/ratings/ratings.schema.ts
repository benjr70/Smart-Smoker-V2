import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";


export type RatingsDocument = Ratings & Document

@Schema()
export class Ratings {
    @Prop()
    smokeFlavor: number;

    @Prop()
    seasoning: number;

    @Prop()
    tenderness: number;

    @Prop()
    overallTaste: number;

    @Prop()
    notes: string;
}

export const RatingsSchema = SchemaFactory.createForClass(Ratings);