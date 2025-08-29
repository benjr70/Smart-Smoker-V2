import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Settings, SettingsDocument } from './settings.schema';
import { Model } from 'mongoose';
import { CreateSettingsDto } from './settingsDto';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>,
  ) {}

  async create(createSettingsDto: CreateSettingsDto): Promise<Settings> {
    const createdSettings = new this.settingsModel(createSettingsDto);
    return createdSettings.save();
  }

  async findAll(): Promise<Settings[]> {
    return this.settingsModel.find().exec();
  }
}
