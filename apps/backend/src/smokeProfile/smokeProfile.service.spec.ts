import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RatingsService } from '../ratings/ratings.service';
import { childIdOf, idleCook } from '../activeCook/active-cook';
import { ActiveCookService } from '../activeCook/active-cook.service';
import {
  attachedCook,
  FakeActiveCook,
  fakeActiveCook,
} from '../activeCook/testing/fake-active-cook';
import { StatsService } from '../stats/stats.service';
import { SmokeProfileService } from './smokeProfile.service';
import { SmokeProFileDto } from './smokeProfileDto';

const query = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

describe('SmokeProfileService', () => {
  let service: SmokeProfileService;
  let model: any;
  let activeCook: FakeActiveCook;
  let ratingsService: { saveCurrentRatings: jest.Mock };
  let stats: { markDirty: jest.Mock };

  const dto: SmokeProFileDto = {
    chamberName: 'Big Green Egg',
    probe1Name: 'Brisket',
    probe2Name: 'Pork Shoulder',
    probe3Name: 'Chicken',
    notes: 'Low and slow cook',
    woodType: 'Hickory',
  };

  const existing = { _id: 'profile-1', ...dto };

  /** A cook mid-session, carrying whatever links the test gives it. */
  const cookLinking = (links: Record<string, string | undefined>) =>
    attachedCook({ _id: 'cook-1', preSmokeId: 'pre-1', ...links });

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

    activeCook = fakeActiveCook(cookLinking({ smokeProfileId: 'profile-1' }));

    ratingsService = { saveCurrentRatings: jest.fn().mockResolvedValue({}) };
    stats = { markDirty: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmokeProfileService,
        { provide: getModelToken('SmokeProfile'), useValue: model },
        { provide: ActiveCookService, useValue: activeCook },
        { provide: RatingsService, useValue: ratingsService },
        { provide: StatsService, useValue: stats },
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
    it('loads the profile the Active Cook links', async () => {
      const result = await service.getCurrentSmokeProfile();

      expect(model.findById).toHaveBeenCalledWith('profile-1');
      expect(result).toEqual(existing);
    });

    /**
     * The alert check names probes as the cook it is judging named them, so
     * the cook travels down with the question — and a profile read against a
     * cook resolved again here could name another cook's probes.
     */
    it('loads the profile of an Active Cook it was handed, resolving none of its own', async () => {
      const handed = attachedCook({
        _id: 'cook-9',
        smokeProfileId: 'profile-9',
      });

      await service.getCurrentSmokeProfile(handed);

      expect(model.findById).toHaveBeenCalledWith('profile-9');
      expect(activeCook.resolve).not.toHaveBeenCalled();
    });

    it('returns the default profile when the cook has none yet', async () => {
      activeCook.pointAt(cookLinking({ smokeProfileId: undefined }));

      expect(await service.getCurrentSmokeProfile()).toEqual(defaultProfile);
      expect(model.findById).not.toHaveBeenCalled();
    });

    it('returns the default profile when there is no Active Cook', async () => {
      activeCook.pointAt(idleCook());

      expect(await service.getCurrentSmokeProfile()).toEqual(defaultProfile);
      expect(model.findById).not.toHaveBeenCalled();
    });
  });

  describe('saveCurrentSmokeProfile', () => {
    it('updates the profile the cook already links', async () => {
      const result = await service.saveCurrentSmokeProfile(dto);

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'profile-1',
        { $set: dto },
        { new: true },
      );
      expect(model).not.toHaveBeenCalled();
      expect(result).toEqual(existing);
    });

    it('creates one and links it onto the cook when there is none', async () => {
      activeCook.pointAt(cookLinking({ smokeProfileId: undefined }));

      const result = await service.saveCurrentSmokeProfile(dto);

      expect(model).toHaveBeenCalledWith(dto);
      expect(result).toMatchObject({ _id: 'new-profile-id' });
      expect(childIdOf(activeCook.cook(), 'smokeProfileId')).toBe(
        'new-profile-id',
      );
      expect(childIdOf(activeCook.cook(), 'preSmokeId')).toBe('pre-1');
    });

    /**
     * Setting the profile is what opens a session, and the Smoke step wants a
     * score to show before anybody has given one — so the first profile a cook
     * gains seeds a blank rating alongside it.
     */
    it('seeds a blank rating the first time a cook gains a profile', async () => {
      activeCook.pointAt(cookLinking({ smokeProfileId: undefined }));

      await service.saveCurrentSmokeProfile(dto);

      expect(ratingsService.saveCurrentRatings).toHaveBeenCalledWith({
        smokeFlavor: 0,
        seasoning: 0,
        tenderness: 0,
        overallTaste: 0,
        notes: '',
      });
      expect(ratingsService.saveCurrentRatings).toHaveBeenCalledTimes(1);
    });

    it('seeds nothing when the cook is already scored', async () => {
      activeCook.pointAt(
        cookLinking({ smokeProfileId: undefined, ratingId: 'rating-1' }),
      );

      await service.saveCurrentSmokeProfile(dto);

      expect(ratingsService.saveCurrentRatings).not.toHaveBeenCalled();
    });

    it('seeds nothing when the profile was only updated', async () => {
      await service.saveCurrentSmokeProfile(dto);

      expect(ratingsService.saveCurrentRatings).not.toHaveBeenCalled();
    });

    it('answers 404 when there is no Active Cook', async () => {
      activeCook.pointAt(idleCook());

      await expect(service.saveCurrentSmokeProfile(dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('the statistics the wood belongs to', () => {
    it('marks them stale when a cook’s profile is edited', async () => {
      // Which wood a cook was smoked over is counted on the Stats screen, and
      // changing it moves no cook in or out of the archive — the count guard
      // would never see it, so the write has to say so itself.
      await service.update('profile-1', dto);

      expect(stats.markDirty).toHaveBeenCalled();
    });
  });

  // create / getById / update / delete are inherited from BaseService and
  // verified once at the BaseService boundary (base.service.spec.ts).
});
