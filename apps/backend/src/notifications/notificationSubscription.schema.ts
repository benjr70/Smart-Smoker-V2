import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type NotificationSubscriptionDocument = NotificationSubscription &
  Document;

@Schema()
export class Keys {
  @ApiProperty()
  @Prop()
  p256dh: string;

  @ApiProperty()
  @Prop()
  auth: string;
}

@Schema()
export class NotificationSubscription {
  @ApiProperty()
  @Prop()
  endpoint: string;

  /**
   * Null whenever the browser issues a subscription that never expires, which
   * is the common case. The storage type is explicit because the emitted
   * decorator metadata for a `number | null` union is just `Object`, and
   * Mongoose cannot infer a field type from that.
   */
  @ApiProperty()
  @Prop({ type: Number })
  expirationTime: number | null;

  @ApiProperty()
  @Prop()
  keys: Keys;
}

export const NotificationSubscriptionSchema = SchemaFactory.createForClass(
  NotificationSubscription,
);
