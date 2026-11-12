import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export type StateDocument = State & Document;

/**
 * The id the Active Cook seeds the state document under at boot.
 *
 * Fixed rather than minted, because `_id` is the only unique index on this
 * collection and so the only thing two writers racing to create the singleton
 * can contend on: the second insert is refused by the store rather than
 * leaving two state documents behind, each read as "the" state by whichever
 * query happens to find it first. A smoker that already holds a state document
 * under a minted id keeps that document and that id; the seed only ever
 * creates the singleton when the collection has none.
 */
export const STATE_SINGLETON_ID = new Types.ObjectId(
  '000000000000000000000001',
);

@Schema()
export class State {
  @Prop()
  smokeId: string;

  @Prop()
  smoking: boolean;
}

export const stateSchema = SchemaFactory.createForClass(State);
