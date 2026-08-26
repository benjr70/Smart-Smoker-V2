import { ApiProperty } from '@nestjs/swagger';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { StampTone } from '../appSettings/stamp-catalogue';

export type CookEventDocument = CookEvent & Document;

/**
 * One tap: what was done to the cook, when, and what the pit was doing at that
 * instant.
 *
 * The label and tone are snapshots taken at the moment of the tap, not the
 * truth about what the stamp is called — see `stamp-catalogue`, where a key
 * that still exists resolves to the catalogue's current label. They are stored
 * so that an event logged under a stamp that has since been removed still
 * reads as something rather than as a bare key.
 *
 * The temperatures are stored as numbers, unlike the readings they are taken
 * from (the temps collection stores strings), because a snapshot is written
 * once and read by clients that plot it; and nullable, because a cook can be
 * stamped before its first reading has arrived.
 */
@Schema()
export class CookEvent {
  @ApiProperty({ description: 'The cook this was stamped against.' })
  @Prop({ required: true })
  smokeId: string;

  /** The stamp's stable identity; the label is display only. */
  @ApiProperty({ description: 'The catalogue key of the stamp tapped.' })
  @Prop({ required: true })
  stampKey: string;

  @ApiProperty({ description: "The stamp's label when it was tapped." })
  @Prop()
  label: string;

  @ApiProperty({ description: "The stamp's colour when it was tapped." })
  @Prop()
  tone: StampTone;

  /** The server's clock. Never the caller's — kiosks drift. */
  @ApiProperty({ description: 'When it was logged, by the server clock.' })
  @Prop({ required: true })
  at: Date;

  @ApiProperty({ nullable: true, type: Number })
  @Prop({ type: Number, default: null })
  chamberTemp: number | null;

  @ApiProperty({ nullable: true, type: Number })
  @Prop({ type: Number, default: null })
  probe1Temp: number | null;

  @ApiProperty({ nullable: true, type: Number })
  @Prop({ type: Number, default: null })
  probe2Temp: number | null;

  @ApiProperty({ nullable: true, type: Number })
  @Prop({ type: Number, default: null })
  probe3Temp: number | null;
}

export const CookEventSchema = SchemaFactory.createForClass(CookEvent);

/**
 * Events are only ever addressed as "this cook's log, in the order it
 * happened" — by the live card, by the chart markers and by the review
 * section. Without this index that read is a collection scan plus an in-memory
 * sort, which MongoDB aborts above 32MB rather than merely slowing down.
 */
CookEventSchema.index({ smokeId: 1, at: 1 });
