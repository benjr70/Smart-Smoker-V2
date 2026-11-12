import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PreSmokeService } from './presmoke.service';
import { PreSmoke } from './presmoke.schema';
import { PreSmokeDto } from './presmokeDto';
import { idleCook } from '../activeCook/active-cook';
import { ActiveCookService } from '../activeCook/active-cook.service';
import {
  attachedCook,
  FakeActiveCook,
  fakeActiveCook,
} from '../activeCook/testing/fake-active-cook';
import { SmokeStatus } from '../smoke/smoke.schema';
import { StatsService } from '../stats/stats.service';

describe('PreSmokeService', () => {
  let service: PreSmokeService;
  let mockPreSmokeModel: any;
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

  /**
   * Saving this form is the first thing a session does, so it is also how a
   * cook starts. Both halves are the Active Cook's — starting one, and
   * attaching the pre-smoke to the one that is running — and what is held here
   * is that the form reaches the right one.
   */
  describe('save', () => {
    const aPreSmokeDto = (name: string): PreSmokeDto => ({
      name,
      meatType: 'beef',
      weight: mockWeight,
      steps: ['Season with rub'],
      notes: 'notes',
    });

    it('updates the pre-smoke the running cook already links', async () => {
      const dto = aPreSmokeDto('Updated Prep');
      jest
        .spyOn(service, 'update')
        .mockResolvedValue(mockPreSmokeDocument as any);

      const result = await service.save(dto);

      expect(service.update).toHaveBeenCalledWith('existing-presmoke-id', dto);
      expect(result).toEqual(mockPreSmokeDocument);
      expect(activeCook.start).not.toHaveBeenCalled();
    });

    /**
     * The running cook gains the pre-smoke it was missing. This used to create
     * a *second* cook to hang the new pre-smoke off, leaving the cook the
     * smoker was attached to with no pre-smoke at all.
     */
    it('links a new pre-smoke onto a running cook that has none', async () => {
      activeCook.pointAt(
        attachedCook({ _id: 'test-smoke-id', status: SmokeStatus.InProgress }),
      );
      jest.spyOn(service, 'create').mockResolvedValue({
        ...mockPreSmokeDocument,
        _id: 'new-presmoke-id',
      } as any);

      const result = await service.save(aPreSmokeDto('New Prep'));

      expect(result).toEqual(
        expect.objectContaining({ _id: 'new-presmoke-id' }),
      );
      expect(activeCook.cook()).toEqual(
        expect.objectContaining({
          smokeId: 'test-smoke-id',
          smoke: expect.objectContaining({ preSmokeId: 'new-presmoke-id' }),
        }),
      );
    });

    it('starts a cook, and attaches it, when the smoker is idle', async () => {
      activeCook.pointAt(idleCook());
      jest.spyOn(service, 'create').mockResolvedValue({
        ...mockPreSmokeDocument,
        _id: 'brand-new-presmoke-id',
      } as any);

      const result = await service.save(aPreSmokeDto('Brand New Prep'));

      expect(activeCook.start).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({ _id: 'brand-new-presmoke-id' }),
      );
      expect(activeCook.cook()).toEqual(
        expect.objectContaining({
          idle: false,
          smoke: expect.objectContaining({
            preSmokeId: 'brand-new-presmoke-id',
            status: SmokeStatus.InProgress,
          }),
        }),
      );
    });

    /**
     * Two phones opening the wizard together: the one that loses the start
     * writes the pre-smoke of the cook that was started, rather than into
     * nothing.
     */
    it('attaches to the cook that won when its own start lost', async () => {
      activeCook.pointAt(idleCook());
      activeCook.start.mockImplementation(async () => {
        activeCook.pointAt(attachedCook(mockSmoke, false));
        return { won: false, cook: activeCook.cook(), preSmoke: null };
      });
      jest
        .spyOn(service, 'update')
        .mockResolvedValue(mockPreSmokeDocument as any);

      const result = await service.save(aPreSmokeDto('Raced Prep'));

      expect(service.update).toHaveBeenCalledWith(
        'existing-presmoke-id',
        expect.objectContaining({ name: 'Raced Prep' }),
      );
      expect(result).toEqual(mockPreSmokeDocument);
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
      activeCook.pointAt(idleCook());

      expect(await service.GetByCurrent()).toBeNull();
      expect(mockPreSmokeModel.findById).not.toHaveBeenCalled();
    });

    it('answers nothing for a cook whose pre-smoke was never saved', async () => {
      activeCook.pointAt(
        attachedCook({ _id: 'test-smoke-id', preSmokeId: undefined }),
      );

      expect(await service.GetByCurrent()).toBeNull();
    });

    /** The alert check seeds its probe targets from the meat of one cook. */
    it('reads the pre-smoke of an Active Cook it was handed', async () => {
      await service.GetByCurrent(
        attachedCook({ _id: 'other-cook', preSmokeId: 'other-pre' }),
      );

      expect(activeCook.resolve).not.toHaveBeenCalled();
      expect(mockPreSmokeModel.findById).toHaveBeenCalledWith('other-pre');
    });

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
