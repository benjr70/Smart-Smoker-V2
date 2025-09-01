import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type StateDocument = State & Document;

@Schema()
export class State {
  @Prop()
  smokeId: string;

  @Prop()
  smoking: boolean;
}

export const stateSchema = SchemaFactory.createForClass(State);
