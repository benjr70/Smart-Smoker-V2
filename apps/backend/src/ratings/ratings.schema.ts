import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type RatingsDocument = Ratings & Document;

@Schema()
export class Ratings {
  @Prop({ min: 0, max: 5 })
  smokeFlavor: number;

  @Prop({ min: 0, max: 5 })
  seasoning: number;

  @Prop({ min: 0, max: 5 })
  tenderness: number;

  @Prop({ min: 0, max: 5 })
  overallTaste: number;

  @Prop()
  notes: string;
}

export const RatingsSchema = SchemaFactory.createForClass(Ratings);
