import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type TempDocument = Temp & Document;

@Schema()
export class Temp {
  @Prop()
  MeatTemp: string;

  @Prop()
  Meat2Temp: string;

  @Prop()
  Meat3Temp: string;

  @Prop()
  ChamberTemp: string;

  @Prop()
  tempsId: string;

  @Prop()
  date: Date;
}

export const TempSchema = SchemaFactory.createForClass(Temp);

/**
 * Readings are only ever addressed as "this smoke's series", newest first —
 * which is how alert evaluation reads the latest one on its interval. Without
 * this index that read is a collection scan plus an in-memory sort, and an
 * in-memory sort is not merely slow: MongoDB aborts one that exceeds 32MB, so a
 * long enough cook would start failing rather than degrading.
 */
TempSchema.index({ tempsId: 1, date: -1 });
