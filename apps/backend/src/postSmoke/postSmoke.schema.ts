import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type PostSmokeDocument = PostSmoke & Document;

@Schema()
export class PostSmoke {
  @Prop()
  restTime: string;

  @Prop()
  steps: string[];

  @Prop()
  notes: string;
}

export const PostSmokeSchema = SchemaFactory.createForClass(PostSmoke);
