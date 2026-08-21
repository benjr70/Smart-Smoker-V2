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
   * is the common case.
   *
   * The storage type has to be stated: `@Prop()` infers it from the metadata
   * TypeScript emits for the annotation, and `strictNullChecks` makes the
   * `number | null` union real, so that metadata degrades from `Number` to
   * `Object` and Mongoose throws while building the schema. `Number` is what
   * this field already compiled to with the flag off — the persisted type is
   * unchanged, it is only now written down.
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
