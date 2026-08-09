import { Logger, NotFoundException } from '@nestjs/common';
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
    mockStateModel.findOneAndUpdate = jest
      .fn()
      .mockResolvedValue(mockStateDocument);

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

  describe('updateCurrent', () => {
    it('should update an existing state', async () => {
      const updateDto: State = {
        smokeId: 'updated-smoke-id',
        smoking: false,
      };

      jest
        .spyOn(service, 'GetState')
        .mockResolvedValue(mockStateDocument as State);

      const result = await service.updateCurrent(updateDto);

      expect(mockStateModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'test-id' },
        updateDto,
      );
      expect(result).toEqual(mockStateDocument);
    });

    /**
     * The write succeeds but the read-back finds nothing — the singleton was
     * deleted underneath us. Resolving `undefined` here is what let a
     * non-nullable `Promise<State>` lie to every caller; a miss is now a 404
     * rather than a 200 with an empty body.
     */
    it('throws NotFoundException when the singleton disappears mid-update', async () => {
      jest
        .spyOn(service, 'GetState')
        .mockResolvedValueOnce(mockStateDocument as State)
        .mockResolvedValueOnce(undefined);

      await expect(
        service.updateCurrent({ smokeId: 'gone', smoking: false }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('toggleSmoking', () => {
    it('should toggle smoking to false when currently true', async () => {
      const currentState = {
        ...mockStateDocument,
        smoking: true,
        smokeId: 'test-id',
      };
      jest.spyOn(service, 'GetState').mockResolvedValue(currentState as State);
      jest
        .spyOn(service, 'updateCurrent')
        .mockResolvedValue({ ...currentState, smoking: false } as State);

      const result = await service.toggleSmoking();

      expect(service.updateCurrent).toHaveBeenCalledWith({
        ...currentState,
        smoking: false,
      });
      // `?.` rather than `!`: a null result is a real outcome of
      // toggleSmoking, and reading through it must fail the assertion.
      expect(result?.smoking).toBe(false);
    });

    it('should toggle smoking to true when currently false', async () => {
      const currentState = {
        ...mockStateDocument,
        smoking: false,
        smokeId: 'test-id',
      };
      jest.spyOn(service, 'GetState').mockResolvedValue(currentState as State);
      jest
        .spyOn(service, 'updateCurrent')
        .mockResolvedValue({ ...currentState, smoking: true } as State);

      const result = await service.toggleSmoking();

      expect(service.updateCurrent).toHaveBeenCalledWith({
        ...currentState,
        smoking: true,
      });
      expect(result?.smoking).toBe(true);
    });

    it('should not toggle smoking when smokeId is empty', async () => {
      const currentState = { ...mockStateDocument, smoking: true, smokeId: '' };
      jest.spyOn(service, 'GetState').mockResolvedValue(currentState as State);
      jest
        .spyOn(service, 'updateCurrent')
        .mockResolvedValue(currentState as State);

      const result = await service.toggleSmoking();

      // No active smoke → no write, returns null.
      expect(service.updateCurrent).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('clearSmoke', () => {
    it('should clear smoke data and set smoking to false', async () => {
      const expectedDto: StateDto = {
        smokeId: '',
        smoking: false,
      };

      jest
        .spyOn(service, 'updateCurrent')
        .mockResolvedValue(expectedDto as State);

      const result = await service.clearSmoke();

      expect(service.updateCurrent).toHaveBeenCalledWith(expectedDto);
      expect(result).toEqual(expectedDto);
    });
  });

  /**
   * A fresh install — a new production database or any freshly booted hermetic
   * stack — has an empty `states` collection, which every reader then has to
   * treat as a special case. Seeding the singleton once at startup closes that
   * window for good.
   */
  describe('onModuleInit', () => {
    it('seeds the singleton state when the collection is empty', async () => {
      mockStateModel.find = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      await service.onModuleInit();

      expect(mockStateModel).toHaveBeenCalledWith({
        smokeId: '',
        smoking: false,
      });
    });

    // The backend restarting in the middle of a cook must not reset it: the
    // default model mock already returns a smoking state.
    it('leaves an existing state untouched', async () => {
      await service.onModuleInit();

      expect(mockStateModel).not.toHaveBeenCalled();
      expect(mockStateModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    // A database that is not up yet must not stop the API from booting.
    it('logs and does not throw when the read fails', async () => {
      const errorSpy = jest.spyOn(Logger, 'error').mockImplementation();
      mockStateModel.find = jest.fn().mockReturnValue({
        exec: jest.fn().mockRejectedValue(new Error('no primary available')),
      });

      await expect(service.onModuleInit()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('no primary available'),
        'State',
      );

      errorSpy.mockRestore();
    });
  });
});
