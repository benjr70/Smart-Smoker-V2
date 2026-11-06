import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PreSmokeService } from './presmoke.service';
import { PreSmoke } from './presmoke.schema';
import { PreSmokeDto } from './presmokeDto';
import { StateService } from '../State/state.service';
import { idleCook } from '../activeCook/active-cook';
import { ActiveCookService } from '../activeCook/active-cook.service';
import {
  attachedCook,
  FakeActiveCook,
  fakeActiveCook,
} from '../activeCook/testing/fake-active-cook';
import { SmokeService } from '../smoke/smoke.service';
import { SmokeStatus } from '../smoke/smoke.schema';
import { StatsService } from '../stats/stats.service';

describe('PreSmokeService', () => {
  let service: PreSmokeService;
  let mockPreSmokeModel: any;
  let mockStateService: Partial<StateService>;
  let mockSmokeService: Partial<SmokeService>;
  let mockStatsService: { markDirty: jest.Mock };
  let activeCook: FakeActiveCook;

  const mockWeight = {
    unit: 'lbs',
    weight: 5.5,
  };

  const mockPreSmoke: PreSmoke = {
    name: 'Brisket Prep',
    meatType: 'beef',
    weight: mockWeight,
    steps: ['Season with rub', 'Let rest overnight'],
    notes: 'High quality meat',
  };

  const mockPreSmokeDocument = {
    _id: 'presmoke-id',
    ...mockPreSmoke,
    save: jest.fn().mockResolvedValue(mockPreSmoke),
  };

  const mockState = {
    smokeId: 'test-smoke-id',
    smoking: true,
  };

  const mockSmoke = {
    _id: 'test-smoke-id',
    preSmokeId: 'existing-presmoke-id',
    status: SmokeStatus.InProgress,
  };

  beforeEach(async () => {
    // Create a mock constructor function
    mockPreSmokeModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ ...dto, _id: 'new-presmoke-id' }),
    }));

    // Add static methods to the mock constructor
    mockPreSmokeModel.find = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([mockPreSmokeDocument]),
    });
    mockPreSmokeModel.findById = jest
      .fn()
      .mockResolvedValue(mockPreSmokeDocument);
    mockPreSmokeModel.findOneAndUpdate = jest
      .fn()
      .mockResolvedValue(mockPreSmokeDocument);
    mockPreSmokeModel.deleteOne = jest
      .fn()
      .mockResolvedValue({ deletedCount: 1 });

    mockStateService = {
      GetState: jest.fn().mockResolvedValue(mockState),
      create: jest.fn().mockResolvedValue(mockState),
      updateCurrent: jest.fn().mockResolvedValue(mockState),
    };

    mockSmokeService = {
      getById: jest.fn().mockResolvedValue(mockSmoke),
      create: jest
        .fn()
        .mockResolvedValue({ ...mockSmoke, _id: 'new-smoke-id' }),
      update: jest.fn().mockResolvedValue(mockSmoke),
    };

    mockStatsService = { markDirty: jest.fn().mockResolvedValue(undefined) };

    activeCook = fakeActiveCook(attachedCook(mockSmoke, true));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreSmokeService,
        {
          provide: StatsService,
          useValue: mockStatsService,
        },
        {
          provide: getModelToken(PreSmoke.name),
          useValue: mockPreSmokeModel,
        },
        {
          provide: StateService,
          useValue: mockStateService,
        },
        {
          provide: SmokeService,
          useValue: mockSmokeService,
        },
        {
          provide: ActiveCookService,
          useValue: activeCook,
        },
      ],
    }).compile();

    service = module.get<PreSmokeService>(PreSmokeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('save', () => {
    it('should update existing pre-smoke when smoke has preSmokeId', async () => {
      const preSmokeDto: PreSmokeDto = {
        name: 'Updated Prep',
        meatType: 'beef',
        weight: mockWeight,
        steps: ['Updated step'],
        notes: 'Updated notes',
      };

      jest
        .spyOn(service, 'update')
        .mockResolvedValue(mockPreSmokeDocument as any);

      const result = await service.save(preSmokeDto);

      expect(mockStateService.GetState).toHaveBeenCalled();
      expect(mockSmokeService.getById).toHaveBeenCalledWith(mockState.smokeId);
      expect(service.update).toHaveBeenCalledWith(
        mockSmoke.preSmokeId,
        preSmokeDto,
      );
      expect(result).toEqual(mockPreSmokeDocument);
    });

    it('should create new pre-smoke and smoke when smoke exists but has no preSmokeId', async () => {
      const preSmokeDto: PreSmokeDto = {
        name: 'New Prep',
        meatType: 'chicken',
        weight: mockWeight,
        steps: ['New step'],
        notes: 'New notes',
      };

      const smokeWithoutPreSmokeId = { ...mockSmoke, preSmokeId: undefined };
      mockSmokeService.getById = jest
        .fn()
        .mockResolvedValue(smokeWithoutPreSmokeId);

      jest.spyOn(service, 'create').mockResolvedValue({
        ...mockPreSmokeDocument,
        _id: 'new-presmoke-id',
      } as any);

      const result = await service.save(preSmokeDto);

      expect(service.create).toHaveBeenCalledWith(preSmokeDto);
      expect(mockSmokeService.create).toHaveBeenCalledWith({
        preSmokeId: 'new-presmoke-id',
        status: smokeWithoutPreSmokeId.status,
      });
    });

    it('should create new pre-smoke and smoke when no active smoke exists', async () => {
      const preSmokeDto: PreSmokeDto = {
        name: 'Brand New Prep',
        meatType: 'fish',
        weight: mockWeight,
        steps: ['Fish step'],
        notes: 'Fish notes',
      };

      const stateWithoutSmoke = { ...mockState, smokeId: '' };
      mockStateService.GetState = jest
        .fn()
        .mockResolvedValue(stateWithoutSmoke);

      jest.spyOn(service, 'create').mockResolvedValue({
        ...mockPreSmokeDocument,
        _id: 'brand-new-presmoke-id',
      } as any);

      const result = await service.save(preSmokeDto);

      expect(service.create).toHaveBeenCalledWith(preSmokeDto);
      expect(mockSmokeService.create).toHaveBeenCalledWith({
        preSmokeId: 'brand-new-presmoke-id',
        status: SmokeStatus.InProgress,
      });
      expect(mockStateService.updateCurrent).toHaveBeenCalled();
    });
  });

  describe('GetByCurrent', () => {
    it('reads the pre-smoke the Active Cook is linked to', async () => {
      const result = await service.GetByCurrent();

      expect(activeCook.resolve).toHaveBeenCalled();
      expect(mockPreSmokeModel.findById).toHaveBeenCalledWith(
        mockSmoke.preSmokeId,
      );
      expect(result).toEqual(mockPreSmokeDocument);
    });

    it('answers nothing for an idle smoker', async () => {
      activeCook.attach(idleCook());

      expect(await service.GetByCurrent()).toBeNull();
      expect(mockPreSmokeModel.findById).not.toHaveBeenCalled();
    });

    it('answers nothing for a cook whose pre-smoke was never saved', async () => {
      activeCook.attach(
        attachedCook({ _id: 'test-smoke-id', preSmokeId: undefined }),
      );

      expect(await service.GetByCurrent()).toBeNull();
    });

    /**
     * This read used to create the state document it found missing — a write
     * made on the way to answering a question, on a fresh install's first
     * screen. Seeding at startup is what covers that now.
     */
    it('writes nothing as it reads, not even a missing state document', async () => {
      activeCook.attach(idleCook());

      await service.GetByCurrent();

      expect(mockStateService.create).not.toHaveBeenCalled();
      expect(mockStateService.updateCurrent).not.toHaveBeenCalled();
    });

    /** The alert check seeds its probe targets from the meat of one cook. */
    it('reads the pre-smoke of an Active Cook it was handed', async () => {
      await service.GetByCurrent(
        attachedCook({ _id: 'other-cook', preSmokeId: 'other-pre' }),
      );

      expect(activeCook.resolve).not.toHaveBeenCalled();
      expect(mockPreSmokeModel.findById).toHaveBeenCalledWith('other-pre');
    });

    // TODO: This test reveals a bug in the service logic where state is not reassigned after creation
    // The service tries to access state.smokeId on the original null state variable
    /*
    it('should create default state when none exists', async () => {
      // Mock sequential calls - first returns null, then returns created state
      mockStateService.GetState = jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ smokeId: '', smoking: false });
      
      // Mock the smoke service to handle empty smokeId gracefully  
      mockSmokeService.getById = jest.fn().mockResolvedValue({ preSmokeId: 'mock-presmoke-id' });

      const result = await service.GetByCurrent();

      expect(mockStateService.create).toHaveBeenCalledWith({ smokeId: '', smoking: false });
      // The service has a bug - it doesn't reassign state after creating it
      // So it will still try to access the original null state
      // We can't really test this properly without fixing the service logic
    });
    */
  });

  describe('the statistics the meat belongs to', () => {
    it('marks them stale when a cook’s pre-smoke is edited', async () => {
      mockPreSmokeModel.findByIdAndUpdate = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPreSmokeDocument),
      });

      // The meat, its weight and its name are all counted on the Stats screen,
      // and correcting any of them moves no cook in or out of the archive —
      // the count guard would never see the edit.
      await service.update('presmoke-id', mockPreSmoke as PreSmokeDto);

      expect(mockStatsService.markDirty).toHaveBeenCalled();
    });
  });

  // create / getAll / getById / update / delete are inherited from BaseService
  // and verified once at the BaseService boundary (base.service.spec.ts).
});
