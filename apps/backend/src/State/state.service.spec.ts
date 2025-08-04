import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { StateService } from './state.service';
import { State } from './state.schema';
import { StateDto } from './stateDto';

describe('StateService', () => {
  let service: StateService;
  let mockStateModel: any;

  const mockState: State = {
    smokeId: 'test-smoke-id',
    smoking: true,
  };

  const mockStateDocument = {
    _id: 'test-id',
    ...mockState,
    save: jest.fn().mockResolvedValue(mockState),
  };

  beforeEach(async () => {
    // Create a mock constructor function that returns an object with save method
    mockStateModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ ...dto, _id: 'new-id' }),
    }));

    // Add static methods to the mock constructor
    mockStateModel.find = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([mockStateDocument]),
    });
    mockStateModel.findOneAndUpdate = jest.fn().mockResolvedValue(mockStateDocument);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StateService,
        {
          provide: getModelToken('state'),
          useValue: mockStateModel,
        },
      ],
    }).compile();

    service = module.get<StateService>(StateService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new state', async () => {
      const stateDto: StateDto = {
        smokeId: 'new-smoke-id',
        smoking: false,
      };

      const result = await service.create(stateDto);

      expect(mockStateModel).toHaveBeenCalledWith(stateDto);
      expect(result).toBeDefined();
    });
  });

  describe('GetState', () => {
    it('should return the first state from the database', async () => {
      const result = await service.GetState();

      expect(mockStateModel.find).toHaveBeenCalled();
      expect(result).toEqual(mockStateDocument);
    });

    it('should handle empty state collection', async () => {
      mockStateModel.find = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      const result = await service.GetState();

      expect(result).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update an existing state', async () => {
      const updateDto: State = {
        smokeId: 'updated-smoke-id',
        smoking: false,
      };

      jest.spyOn(service, 'GetState').mockResolvedValue(mockStateDocument as State);

      const result = await service.update(updateDto);

      expect(mockStateModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'test-id' },
        updateDto
      );
    });
  });

  describe('toggleSmoking', () => {
    it('should toggle smoking to false when currently true', async () => {
      const currentState = { ...mockStateDocument, smoking: true, smokeId: 'test-id' };
      jest.spyOn(service, 'GetState').mockResolvedValue(currentState as State);
      jest.spyOn(service, 'update').mockResolvedValue({ ...currentState, smoking: false } as State);

      const result = await service.toggleSmoking();

      expect(service.update).toHaveBeenCalledWith({ ...currentState, smoking: false });
      expect(result.smoking).toBe(false);
    });

    it('should toggle smoking to true when currently false', async () => {
      const currentState = { ...mockStateDocument, smoking: false, smokeId: 'test-id' };
      jest.spyOn(service, 'GetState').mockResolvedValue(currentState as State);
      jest.spyOn(service, 'update').mockResolvedValue({ ...currentState, smoking: true } as State);

      const result = await service.toggleSmoking();

      expect(service.update).toHaveBeenCalledWith({ ...currentState, smoking: true });
      expect(result.smoking).toBe(true);
    });

    it('should not toggle smoking when smokeId is empty', async () => {
      const currentState = { ...mockStateDocument, smoking: true, smokeId: '' };
      jest.spyOn(service, 'GetState').mockResolvedValue(currentState as State);
      jest.spyOn(service, 'update').mockResolvedValue(currentState as State);

      const result = await service.toggleSmoking();

      expect(service.update).toHaveBeenCalledWith(currentState);
      expect(result.smoking).toBe(true); // Should remain unchanged
    });
  });

  describe('clearSmoke', () => {
    it('should clear smoke data and set smoking to false', async () => {
      const expectedDto: StateDto = {
        smokeId: '',
        smoking: false,
      };

      jest.spyOn(service, 'update').mockResolvedValue(expectedDto as State);

      const result = await service.clearSmoke();

      expect(service.update).toHaveBeenCalledWith(expectedDto);
      expect(result).toEqual(expectedDto);
    });
  });
});