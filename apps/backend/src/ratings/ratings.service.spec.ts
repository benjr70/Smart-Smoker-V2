import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { RatingsDto } from './ratingsDto';
import { childIdOf, idleCook } from '../activeCook/active-cook';
import { ActiveCookService } from '../activeCook/active-cook.service';
import {
  attachedCook,
  FakeActiveCook,
  fakeActiveCook,
} from '../activeCook/testing/fake-active-cook';
import { createMockModel } from '../common/testing/create-mock-model';
import { StatsService } from '../stats/stats.service';

describe('RatingsService', () => {
  let service: RatingsService;
  let mockRatingsModel: any;
  let activeCook: FakeActiveCook;
  let mockStatsService: { markDirty: jest.Mock; recalculate: jest.Mock };

  const mockRatingsDto: RatingsDto = {
    smokeFlavor: 4,
    seasoning: 5,
    tenderness: 3,
    overallTaste: 4,
    notes: 'Great flavor, could be more tender',
  };

  const mockRatings = {
    _id: 'rating-id-123',
    ...mockRatingsDto,
  };

  /** A cook mid-session, carrying whatever links the test gives it. */
  const cookLinking = (links: Record<string, string | undefined>) =>
    attachedCook({
      _id: 'smoke-id-123',
      smokeProfileId: 'profile-id',
      preSmokeId: 'pre-smoke-id',
      postSmokeId: 'post-smoke-id',
      tempsId: 'temps-id',
      status: 1,
      ...links,
    });

  beforeEach(async () => {
    // Mock Ratings model (shared factory; overrides are exec()-chainable to
    // match how BaseService drives the model — findById(id).exec()).
    mockRatingsModel = createMockModel({
      findById: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(mockRatings) }),
      findByIdAndUpdate: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(mockRatings) }),
    });

    activeCook = fakeActiveCook(cookLinking({ ratingId: 'rating-id-123' }));

    mockStatsService = {
      markDirty: jest.fn().mockResolvedValue(undefined),
      recalculate: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatingsService,
        {
          provide: getModelToken('Ratings'),
          useValue: mockRatingsModel,
        },
        {
          provide: ActiveCookService,
          useValue: activeCook,
        },
        {
          provide: StatsService,
          useValue: mockStatsService,
        },
      ],
    }).compile();

    service = module.get<RatingsService>(RatingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCurrentRating', () => {
    it('loads the score the Active Cook links', async () => {
      const result = await service.getCurrentRating();

      expect(mockRatingsModel.findById).toHaveBeenCalledWith('rating-id-123');
      expect(result).toEqual(mockRatings);
    });

    /**
     * Nothing to score rather than a failure: the cook is scored as soon as it
     * gains a profile (see the smoke-profile seed), so an unscored read means
     * a session that has not opened yet — which is a fact about the session.
     */
    it('answers nothing when the cook has no score yet', async () => {
      activeCook.pointAt(cookLinking({ ratingId: undefined }));

      expect(await service.getCurrentRating()).toBeNull();
      expect(mockRatingsModel.findById).not.toHaveBeenCalled();
    });

    it('answers nothing when there is no Active Cook', async () => {
      activeCook.pointAt(idleCook());

      expect(await service.getCurrentRating()).toBeNull();
      expect(mockRatingsModel.findById).not.toHaveBeenCalled();
    });
  });

  describe('saveCurrentRatings', () => {
    it('updates the score the cook already links, and answers it', async () => {
      const result = await service.saveCurrentRatings(mockRatingsDto);

      expect(mockRatingsModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'rating-id-123',
        { $set: mockRatingsDto },
        { new: true },
      );
      expect(result).toEqual(mockRatings);
    });

    it('creates one and links it onto the cook when there is none', async () => {
      activeCook.pointAt(cookLinking({ ratingId: undefined }));
      jest.spyOn(service, 'create').mockResolvedValue(mockRatings as any);

      const result = await service.saveCurrentRatings(mockRatingsDto);

      expect(service.create).toHaveBeenCalledWith(mockRatingsDto);
      expect(result).toEqual(mockRatings);
      expect(childIdOf(activeCook.cook(), 'ratingId')).toBe('rating-id-123');
      // The siblings the cook already carried are still on it.
      expect(childIdOf(activeCook.cook(), 'tempsId')).toBe('temps-id');
      expect(childIdOf(activeCook.cook(), 'postSmokeId')).toBe('post-smoke-id');
    });

    it('answers 404 when there is no Active Cook', async () => {
      activeCook.pointAt(idleCook());

      await expect(
        service.saveCurrentRatings(mockRatingsDto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // create / getById / update / delete are inherited from BaseService and
  // verified once at the BaseService boundary (base.service.spec.ts).

  describe('the statistics a score belongs to', () => {
    it('marks them stale when an old cook is re-scored, without recomputing', async () => {
      await service.update('rating-id-123', mockRatingsDto);

      expect(mockStatsService.markDirty).toHaveBeenCalled();
      // Four sliders auto-save as they are dragged; recomputing the whole
      // archive behind each of them is what the dirty flag exists to avoid.
      expect(mockStatsService.recalculate).not.toHaveBeenCalled();
    });

    it('marks them stale when the running cook is rated for the first time', async () => {
      activeCook.pointAt(cookLinking({ ratingId: undefined }));

      await service.saveCurrentRatings(mockRatingsDto);

      expect(mockStatsService.markDirty).toHaveBeenCalled();
      expect(mockStatsService.recalculate).not.toHaveBeenCalled();
    });

    it('still saves the score when the flag cannot be written', async () => {
      mockStatsService.markDirty.mockRejectedValue(new Error('mongo hiccup'));

      // The score is in the database by the time the flag is written. Failing
      // here would tell the pitmaster their rating did not save, and their
      // retry would write it a second time.
      await expect(
        service.update('rating-id-123', mockRatingsDto),
      ).resolves.toBeDefined();
    });

    it('still links the new score when the flag cannot be written', async () => {
      activeCook.pointAt(cookLinking({ ratingId: undefined }));
      mockStatsService.markDirty.mockRejectedValue(new Error('mongo hiccup'));

      await expect(
        service.saveCurrentRatings(mockRatingsDto),
      ).resolves.toBeDefined();
      expect(childIdOf(activeCook.cook(), 'ratingId')).toBeTruthy();
    });

    it('marks them stale when a score is deleted', async () => {
      // A delete changes the averages as surely as a write does, and it leaves
      // the number of completed cooks alone — so nothing but the flag would
      // ever notice the stored numbers still count the score that is gone.
      await service.delete('rating-id-123');

      expect(mockStatsService.markDirty).toHaveBeenCalled();
    });

    it('marks them stale again once the cook points at its new score', async () => {
      activeCook.pointAt(cookLinking({ ratingId: undefined }));
      // What the cook linked each time the flag was written.
      const linkedWhenMarked: (string | null)[] = [];
      mockStatsService.markDirty.mockImplementation(async () => {
        linkedWhenMarked.push(childIdOf(activeCook.cook(), 'ratingId'));
      });

      await service.saveCurrentRatings(mockRatingsDto);

      // The rating exists before the cook points at it, and a rebuild in that
      // window reads an archive where the cook has no score — then clears the
      // flag the create had set. Marking again after the link means no rebuild
      // can end without having seen the score.
      expect(linkedWhenMarked).toEqual([null, 'mock-id']);
    });
  });
});
