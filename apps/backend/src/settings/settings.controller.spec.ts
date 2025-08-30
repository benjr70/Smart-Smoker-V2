import { Test, TestingModule } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { Settings } from './settings.schema';
import { CreateSettingsDto } from './settingsDto';

describe('SettingsController', () => {
  let controller: SettingsController;
  let mockSettingsService: Partial<SettingsService>;

  const mockNotifications = {
    MinMeatTemp: 140,
    MaxMeatTemp: 200,
    MinChamberTemp: 200,
    MaxChamberTemp: 300,
  };

  const mockSettings: Settings = {
    id: 'settings-1',
    dataExportEmail: 'test@example.com',
    notifications: mockNotifications,
  };

  const mockSettingsList: Settings[] = [mockSettings];

  beforeEach(async () => {
    mockSettingsService = {
      findAll: jest.fn().mockResolvedValue(mockSettingsList),
      create: jest.fn().mockResolvedValue(mockSettings),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        {
          provide: SettingsService,
          useValue: mockSettingsService,
        },
      ],
    }).compile();

    controller = module.get<SettingsController>(SettingsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSettings', () => {
    it('should return all settings', async () => {
      const result = await controller.getSettings();

      expect(mockSettingsService.findAll).toHaveBeenCalled();
      expect(result).toEqual(mockSettingsList);
    });
  });

  describe('SetSettings', () => {
    it('should create new settings', async () => {
      const createSettingsDto: CreateSettingsDto = {
        id: 'new-settings',
        dataExportEmail: 'new@example.com',
        notifications: {
          MinMeatTemp: 150,
          MaxMeatTemp: 210,
          MinChamberTemp: 210,
          MaxChamberTemp: 310,
        },
      };

      const result = await controller.SetSettings(createSettingsDto);

      expect(mockSettingsService.create).toHaveBeenCalledWith(
        createSettingsDto,
      );
      expect(result).toEqual(mockSettings);
    });
  });
});
