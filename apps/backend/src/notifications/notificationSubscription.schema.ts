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

  @ApiProperty()
  @Prop()
  expirationTime: number | null;

  @ApiProperty()
  @Prop()
  keys: Keys;
}

export const NotificationSubscriptionSchema = SchemaFactory.createForClass(
  NotificationSubscription,
);
