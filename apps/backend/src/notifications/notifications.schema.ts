import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";


export type NotificationsDocument = Notifications & Document

@Schema()
export class Keys {
  @Prop()
  p256dh: string;

  @Prop()
  auth: string;
}

@Schema()
export class Notifications {
    @Prop()
    endpoint: string;
  
    @Prop()
    expirationTime: number | null;
  
    @Prop()
    keys: Keys;
}

export const NotificationsSchema = SchemaFactory.createForClass(Notifications);

