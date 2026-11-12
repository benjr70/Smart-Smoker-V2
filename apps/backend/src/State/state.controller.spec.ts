import { Test, TestingModule } from '@nestjs/testing';
import { idleCook } from '../activeCook/active-cook';
import { ActiveCookService } from '../activeCook/active-cook.service';
import {
  attachedCook,
  FakeActiveCook,
  fakeActiveCook,
} from '../activeCook/testing/fake-active-cook';
import { SmokeStatus } from '../smoke/smoke.schema';
import { StateController } from './state.controller';
import { StateService } from './state.service';
import { State } from './state.schema';
import { StateDto } from './stateDto';

describe('StateController', () => {
  let controller: StateController;
  let mockStateService: Partial<StateService>;
  /**
   * The Active Cook as every other spec of a route through it takes it: the
   * shared fake, pointed at a lit cook. A hand-rolled `{ toggle: jest.Mock }`
   * would let this spec describe a transition the real one cannot make.
   */
  let activeCook: FakeActiveCook;

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

    activeCook = fakeActiveCook(
      attachedCook(
        { _id: 'test-smoke-id', status: SmokeStatus.InProgress },
        true,
      ),
    );

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StateController],
      providers: [
        {
          provide: StateService,
          useValue: mockStateService,
        },
        {
          provide: ActiveCookService,
          useValue: activeCook,
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

      expect(activeCook.toggle).toHaveBeenCalledWith();
      expect(result).toEqual(
        expect.objectContaining({ smokeId: 'test-smoke-id', smoking: false }),
      );
    });

    /** A toggle on an idle smoker has always answered with nothing. */
    it('answers with nothing when there was no cook to toggle', async () => {
      activeCook.pointAt(idleCook());

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
