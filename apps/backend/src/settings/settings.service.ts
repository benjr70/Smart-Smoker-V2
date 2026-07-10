import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { Settings, SettingsDocument } from './settings.schema';

@Injectable()
export class SettingsService extends BaseService<SettingsDocument> {
  constructor(@InjectModel(Settings.name) model: Model<SettingsDocument>) {
    super(model, 'Settings');
  }
}
