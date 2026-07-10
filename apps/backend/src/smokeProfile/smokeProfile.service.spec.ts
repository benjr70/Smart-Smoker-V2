import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RatingsService } from '../ratings/ratings.service';
import { CurrentSmokeService } from '../common/current-smoke.service';
import { Smoke } from '../smoke/smoke.schema';
import { SmokeProfileService } from './smokeProfile.service';
import { SmokeProFileDto } from './smokeProfileDto';

const query = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

describe('SmokeProfileService', () => {
  let service: SmokeProfileService;
  let model: any;
  let currentSmoke: {
    readCurrent: jest.Mock;
    upsertCurrent: jest.Mock;
  };
  let ratingsService: { saveCurrentRatings: jest.Mock };

  const dto: SmokeProFileDto = {
    chamberName: 'Big Green Egg',
    probe1Name: 'Brisket',
    probe2Name: 'Pork Shoulder',
    probe3Name: 'Chicken',
    notes: 'Low and slow cook',
    woodType: 'Hickory',
  };

  const existing = { _id: 'profile-1', ...dto };

  const defaultProfile = {
    notes: '',
    woodType: '',
    chamberName: 'Chamber',
    probe1Name: 'Probe1',
    probe2Name: 'Probe2',
    probe3Name: 'Probe3',
  };

  beforeEach(async () => {
    model = jest.fn().mockImplementation((doc) => ({
      ...doc,
      save: jest.fn().mockResolvedValue({ ...doc, _id: 'new-profile-id' }),
    }));
    model.findById = jest.fn().mockReturnValue(query(existing));
    model.findByIdAndUpdate = jest.fn().mockReturnValue(query(existing));
    model.deleteOne = jest.fn().mockReturnValue(query({ deletedCount: 1 }));

    currentSmoke = {
      readCurrent: jest.fn(),
      upsertCurrent: jest.fn(),
    };

    ratingsService = { saveCurrentRatings: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmokeProfileService,
        { provide: getModelToken('SmokeProfile'), useValue: model },
        { provide: CurrentSmokeService, useValue: currentSmoke },
        { provide: RatingsService, useValue: ratingsService },
      ],
    }).compile();

    service = module.get<SmokeProfileService>(SmokeProfileService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCurrentSmokeProfile', () => {
    it('loads the linked profile via the current-smoke walk', async () => {
      currentSmoke.readCurrent.mockImplementation((key, load) =>
        load('profile-1'),
      );

      const result = await service.getCurrentSmokeProfile();

      expect(currentSmoke.readCurrent).toHaveBeenCalledWith(
        'smokeProfileId',
        expect.any(Function),
        expect.objectContaining(defaultProfile),
      );
      expect(model.findById).toHaveBeenCalledWith('profile-1');
      expect(result).toEqual(existing);
    });

    it('returns the default profile when nothing is active (fallback)', async () => {
      currentSmoke.readCurrent.mockImplementation(
        (key, load, fallback) => fallback,
      );

      const result = await service.getCurrentSmokeProfile();

      expect(result).toEqual(defaultProfile);
      expect(model.findById).not.toHaveBeenCalled();
    });
  });

  describe('saveCurrentSmokeProfile', () => {
    it('updates the linked profile when one already exists', async () => {
      currentSmoke.upsertCurrent.mockImplementation((key, handlers) =>
        handlers.update('profile-1'),
      );

      const result = await service.saveCurrentSmokeProfile(dto);

      expect(currentSmoke.upsertCurrent).toHaveBeenCalledWith(
        'smokeProfileId',
        expect.objectContaining({
          update: expect.any(Function),
          create: expect.any(Function),
          onResolveSmoke: expect.any(Function),
        }),
      );
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'profile-1',
        { $set: dto },
        { new: true },
      );
      expect(result).toEqual(existing);
    });

    it('creates a profile and reports its new child id when none exists', async () => {
      let linkedChildId: string | undefined;
      currentSmoke.upsertCurrent.mockImplementation(async (key, handlers) => {
        const created = await handlers.create();
        linkedChildId = created.childId;
        return created.result;
      });

      const result = await service.saveCurrentSmokeProfile(dto);

      expect(model).toHaveBeenCalledWith(dto);
      expect(linkedChildId).toBe('new-profile-id');
      expect(result).toMatchObject({ _id: 'new-profile-id' });
    });

    it('seeds default ratings via onResolveSmoke when the smoke has no rating yet', async () => {
      const smoke = { ratingId: undefined } as unknown as Smoke;
      currentSmoke.upsertCurrent.mockImplementation(async (key, handlers) => {
        await handlers.onResolveSmoke(smoke);
        const created = await handlers.create();
        return created.result;
      });

      await service.saveCurrentSmokeProfile(dto);

      expect(ratingsService.saveCurrentRatings).toHaveBeenCalledWith({
        smokeFlavor: 0,
        seasoning: 0,
        tenderness: 0,
        overallTaste: 0,
        notes: '',
      });
    });

    it('does not re-seed ratings via onResolveSmoke when one already exists', async () => {
      const smoke = { ratingId: 'rating-1' } as unknown as Smoke;
      currentSmoke.upsertCurrent.mockImplementation(async (key, handlers) => {
        await handlers.onResolveSmoke(smoke);
        const created = await handlers.create();
        return created.result;
      });

      await service.saveCurrentSmokeProfile(dto);

      expect(ratingsService.saveCurrentRatings).not.toHaveBeenCalled();
    });

    it('propagates the 404 when there is no active smoke', async () => {
      currentSmoke.upsertCurrent.mockRejectedValue(new NotFoundException());

      await expect(service.saveCurrentSmokeProfile(dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // create / getById / update / delete are inherited from BaseService and
  // verified once at the BaseService boundary (base.service.spec.ts).
});
