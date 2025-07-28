import { Test, TestingModule } from '@nestjs/testing';
import { StateController } from './state.controller';
import { StateService } from './state.service';
import { State } from './state.schema';
import { StateDto } from './stateDto';

describe('StateController', () => {
  let controller: StateController;
  let mockStateService: Partial<StateService>;

  const mockState: State = {
    smokeId: 'test-smoke-id',
    smoking: true,
  };

  beforeEach(async () => {
    mockStateService = {
      GetState: jest.fn().mockResolvedValue(mockState),
      update: jest.fn().mockResolvedValue(mockState),
      create: jest.fn().mockResolvedValue(mockState),
      toggleSmoking: jest.fn().mockResolvedValue({ ...mockState, smoking: false }),
      clearSmoke: jest.fn().mockResolvedValue({ smokeId: '', smoking: false }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StateController],
      providers: [
        {
          provide: StateService,
          useValue: mockStateService,
        },
      ],
    }).compile();

    controller = module.get<StateController>(StateController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getState', () => {
    it('should return the current state', async () => {
      const result = await controller.getState();

      expect(mockStateService.GetState).toHaveBeenCalled();
      expect(result).toEqual(mockState);
    });
  });

  describe('updateState', () => {
    it('should update the state with provided dto', async () => {
      const stateDto: StateDto = {
        smokeId: 'updated-smoke-id',
        smoking: false,
      };

      const result = await controller.updateState(stateDto);

      expect(mockStateService.update).toHaveBeenCalledWith(stateDto);
      expect(result).toEqual(mockState);
    });
  });

  describe('CreateState', () => {
    it('should create a new state with provided dto', async () => {
      const stateDto: StateDto = {
        smokeId: 'new-smoke-id',
        smoking: false,
      };

      const result = await controller.CreateState(stateDto);

      expect(mockStateService.create).toHaveBeenCalledWith(stateDto);
      expect(result).toEqual(mockState);
    });
  });

  describe('toggleSmoking', () => {
    it('should toggle the smoking status', async () => {
      const result = await controller.toggleSmoking();

      expect(mockStateService.toggleSmoking).toHaveBeenCalled();
      expect(result).toEqual({ ...mockState, smoking: false });
    });
  });

  describe('clearSmoke', () => {
    it('should clear the smoke data', async () => {
      const result = await controller.clearSmoke();

      expect(mockStateService.clearSmoke).toHaveBeenCalled();
      expect(result).toEqual({ smokeId: '', smoking: false });
    });
  });
});