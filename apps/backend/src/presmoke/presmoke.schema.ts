import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type WeightDocument = Weight & Document;

@Schema()
export class Weight {
  @Prop()
  unit: string;

  @Prop()
  weight: number;
}
export const WeightSchema = SchemaFactory.createForClass(Weight);
export type PreSmokeDocument = PreSmoke & Document;

@Schema()
export class PreSmoke {
  @Prop()
  name: string;

  @Prop()
  meatType: string;

  @Prop()
  weight: Weight;

  @Prop()
  steps: string[];

  @Prop()
  notes: string;
}

export const PreSmokeSchema = SchemaFactory.createForClass(PreSmoke);
