import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SettingsService } from './settings.service';
import { Settings } from './settings.schema';
import { CreateSettingsDto } from './settingsDto';

describe('SettingsService', () => {
  let service: SettingsService;
  let mockSettingsModel: any;

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

  const mockSettingsDocument = {
    _id: 'settings-doc-id',
    ...mockSettings,
    save: jest.fn().mockResolvedValue(mockSettings),
  };

  beforeEach(async () => {
    // Create a mock constructor function
    mockSettingsModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ ...dto, _id: 'new-settings-id' }),
    }));

    // Add static methods to the mock constructor
    mockSettingsModel.find = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([mockSettingsDocument]),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: getModelToken(Settings.name),
          useValue: mockSettingsModel,
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
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

      const result = await service.create(createSettingsDto);

      expect(mockSettingsModel).toHaveBeenCalledWith(createSettingsDto);
      expect(result).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should return all settings', async () => {
      const result = await service.findAll();

      expect(mockSettingsModel.find).toHaveBeenCalled();
      expect(result).toEqual([mockSettingsDocument]);
    });
  });
});