import { ApiProperty } from '@nestjs/swagger';

export class Notifications {
  @ApiProperty()
  MinMeatTemp: number;
  @ApiProperty()
  MaxMeatTemp: number;
  @ApiProperty()
  MinChamberTemp: number;
  @ApiProperty()
  MaxChamberTemp: number;
}

export class CreateSettingsDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  dataExportEmail: string;
  @ApiProperty()
  notifications: Notifications;
}
