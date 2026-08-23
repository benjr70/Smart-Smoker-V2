import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type SmokeProFileDocument = SmokeProfile & Document;

@Schema()
export class SmokeProfile {
  @Prop()
  chamberName: string;

  @Prop()
  probe1Name: string;

  @Prop()
  probe2Name: string;

  @Prop()
  probe3Name: string;

  @Prop()
  notes: string;

  @Prop()
  woodType: string;
}

export const SmokeProFileSchema = SchemaFactory.createForClass(SmokeProfile);

/**
 * What a cook is called before anybody renames anything — the profile a session
 * with none stored reads as.
 *
 * Lives on the schema rather than in the service that serves it because it is
 * also what a backend-originated `smokeUpdate` must carry for such a session:
 * that frame's names are applied by the apps, so announcing anything else would
 * relabel a screen. Two copies of these four strings would drift, and the drift
 * would show up as probe labels changing by themselves.
 */
export const DEFAULT_SMOKE_PROFILE: Readonly<SmokeProfile> = Object.freeze({
  notes: '',
  woodType: '',
  chamberName: 'Chamber',
  probe1Name: 'Probe1',
  probe2Name: 'Probe2',
  probe3Name: 'Probe3',
});
