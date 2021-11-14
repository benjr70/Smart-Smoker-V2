import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose'

export type NotificationsDocument = Notifications & Document;

@Schema()
export class Notifications {
    @Prop()
    MinMeatTemp: number;
    @Prop()
    MaxMeatTemp: number;
    @Prop()
    MinChamberTemp: number;
    @Prop()
    MaxChamberTemp: number;
}

export const NotificationsSchema = SchemaFactory.createForClass(Notifications);
export type SettingsDocument = Settings & Document


@Schema()
export class Settings {
    @Prop()
    id: string;

    @Prop()
    dataExportEmail: string;

    @Prop()
    notifications: Notifications;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);

