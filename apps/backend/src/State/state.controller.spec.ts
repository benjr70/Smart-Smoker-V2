import { Test, TestingModule } from '@nestjs/testing';
import { ActiveCookService } from '../activeCook/active-cook.service';
import { StateController } from './state.controller';
import { StateService } from './state.service';
import { State } from './state.schema';
import { StateDto } from './stateDto';

describe('StateController', () => {
  let controller: StateController;
  let mockStateService: Partial<StateService>;
  let mockActiveCook: { toggle: jest.Mock };

  const mockState: State = {
    smokeId: 'test-smoke-id',
    smoking: true,
  };

  beforeEach(async () => {
    mockStateService = {
      GetState: jest.fn().mockResolvedValue(mockState),
      updateCurrent: jest.fn().mockResolvedValue(mockState),
      create: jest.fn().mockResolvedValue(mockState),
      clearSmoke: jest.fn().mockResolvedValue({ smokeId: '', smoking: false }),
    };

    mockActiveCook = {
      toggle: jest.fn().mockResolvedValue({
        won: true,
        cook: { idle: true, smoking: false },
        state: { ...mockState, smoking: false },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StateController],
      providers: [
        {
          provide: StateService,
          useValue: mockStateService,
        },
        {
          provide: ActiveCookService,
          useValue: mockActiveCook,
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

      expect(mockStateService.updateCurrent).toHaveBeenCalledWith(stateDto);
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
    it('flips through the Active Cook and answers with the state it left', async () => {
      const result = await controller.toggleSmoking();

      expect(mockActiveCook.toggle).toHaveBeenCalledWith();
      expect(result).toEqual({ ...mockState, smoking: false });
    });

    /** A toggle on an idle smoker has always answered with nothing. */
    it('answers with nothing when there was no cook to toggle', async () => {
      mockActiveCook.toggle.mockResolvedValue({
        won: false,
        cook: { idle: true, smoking: false },
        state: null,
      });

      expect(await controller.toggleSmoking()).toBeNull();
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
