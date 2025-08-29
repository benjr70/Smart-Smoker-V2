import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type SmokeDocument = Smoke & Document;

export enum SmokeStatus {
  'InProgress',
  'Complete',
}

@Schema()
export class Smoke {
  @Prop()
  preSmokeId: string;

  @Prop()
  tempsId: string;

  @Prop()
  postSmokeId: string;

  @Prop()
  smokeProfileId: string;

  @Prop()
  ratingId: string;

  @Prop()
  date: Date;

  @Prop()
  status: SmokeStatus;
}

export const SmokeSchema = SchemaFactory.createForClass(Smoke);
