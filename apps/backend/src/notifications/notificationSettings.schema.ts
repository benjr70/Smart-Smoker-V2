import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { ApiProperty } from "@nestjs/swagger";



export type NotificationSettingsDocument = NotificationSettings & Document



@Schema()
export class NotificationSetting {

    @ApiProperty()
    @Prop()
    type: boolean;

    @ApiProperty()
    @Prop()
    message: string;

    @ApiProperty()
    @Prop()
    probe1: string;

    @ApiProperty()
    @Prop()
    op: string;

    @ApiProperty()
    @Prop({ default: undefined })
    probe2?: string;

    @ApiProperty()
    @Prop({ default: undefined })
    offset?: number;

    @ApiProperty()
    @Prop({ default: undefined })
    temperature?: number;

}

export const NotificationSettingSchema = SchemaFactory.createForClass(NotificationSetting);


@Schema()
export class NotificationSettings {
  @ApiProperty({ type: [NotificationSetting] })
  @Prop({ type: [NotificationSettingSchema] })
  settings: NotificationSetting[];
}

export const NotificationSettingsSchema = SchemaFactory.createForClass(NotificationSettings);