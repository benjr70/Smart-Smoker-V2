import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { PostSmokeService } from './postSmoke.service';
import { PostSmoke } from './postSmoke.schema';
import { PostSmokeDto } from './postSmokeDto';
import { childIdOf, idleCook } from '../activeCook/active-cook';
import { ActiveCookService } from '../activeCook/active-cook.service';
import {
  attachedCook,
  FakeActiveCook,
  fakeActiveCook,
} from '../activeCook/testing/fake-active-cook';
import { StatsService } from '../stats/stats.service';

const query = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

describe('PostSmokeService', () => {
  let service: PostSmokeService;
  let model: any;
  let activeCook: FakeActiveCook;
  let stats: { markDirty: jest.Mock };

  const existing: PostSmoke = {
    restTime: '30 minutes',
    steps: ['Wrap in foil'],
    notes: 'notes',
  };

  const dto: PostSmokeDto = {
    restTime: '45 minutes',
    steps: ['Cool', 'Slice'],
    notes: 'Perfect results',
  };

  /** The defaults a session with no post-smoke yet renders. */
  const blank = { notes: '', restTime: '', steps: [''] };

  /** A cook mid-session, carrying whatever links the test gives it. */
  const cookLinking = (links: Record<string, string | undefined>) =>
    attachedCook({ _id: 'cook-1', preSmokeId: 'pre-1', ...links });

  beforeEach(async () => {
    model = jest.fn().mockImplementation((doc) => ({
      ...doc,
      save: jest.fn().mockResolvedValue({ ...doc, _id: 'new-postsmoke-id' }),
    }));
    model.findById = jest.fn().mockReturnValue(query(existing));
    model.findByIdAndUpdate = jest
      .fn()
      .mockReturnValue(query({ ...existing, ...dto, _id: 'post-1' }));
    model.deleteOne = jest.fn().mockReturnValue(query({ deletedCount: 1 }));

    activeCook = fakeActiveCook(cookLinking({ postSmokeId: 'post-1' }));
    stats = { markDirty: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostSmokeService,
        { provide: StatsService, useValue: stats },
        { provide: getModelToken('PostSmoke'), useValue: model },
        { provide: ActiveCookService, useValue: activeCook },
      ],
    }).compile();

    service = module.get<PostSmokeService>(PostSmokeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCurrentPostSmoke', () => {
    it('loads the post-smoke the Active Cook links', async () => {
      const result = await service.getCurrentPostSmoke();

      expect(model.findById).toHaveBeenCalledWith('post-1');
      expect(result).toEqual(existing);
    });

    it('renders the blank defaults when the cook has no post-smoke yet', async () => {
      activeCook.pointAt(cookLinking({ postSmokeId: undefined }));

      expect(await service.getCurrentPostSmoke()).toEqual(blank);
      expect(model.findById).not.toHaveBeenCalled();
    });

    it('renders the blank defaults when there is no Active Cook', async () => {
      activeCook.pointAt(idleCook());

      expect(await service.getCurrentPostSmoke()).toEqual(blank);
      expect(model.findById).not.toHaveBeenCalled();
    });
  });

  describe('saveCurrentPostSmoke', () => {
    it('updates the post-smoke the cook already links', async () => {
      const result = await service.saveCurrentPostSmoke(dto);

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'post-1',
        { $set: dto },
        { new: true },
      );
      expect(model).not.toHaveBeenCalled();
      expect(result).toMatchObject({ _id: 'post-1' });
    });

    it('creates one and links it onto the cook when there is none', async () => {
      activeCook.pointAt(cookLinking({ postSmokeId: undefined }));

      const result = await service.saveCurrentPostSmoke(dto);

      expect(model).toHaveBeenCalledWith(dto);
      expect(result).toMatchObject({ _id: 'new-postsmoke-id' });
      // Read back off the cook, which is where the next request finds it.
      expect(childIdOf(activeCook.cook(), 'postSmokeId')).toBe(
        'new-postsmoke-id',
      );
      expect(childIdOf(activeCook.cook(), 'preSmokeId')).toBe('pre-1');
    });

    it('answers 404 when there is no Active Cook', async () => {
      activeCook.pointAt(idleCook());

      await expect(service.saveCurrentPostSmoke(dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('the statistics the rest time belongs to', () => {
    it('marks them stale when a cook’s post-smoke is edited', async () => {
      // Rest time is one of the numbers on the Stats screen, and editing it
      // leaves the number of completed cooks alone — so nothing but the flag
      // would ever tell the stored aggregate it had gone out of date.
      await service.update('post-1', dto);

      expect(stats.markDirty).toHaveBeenCalled();
    });
  });

  describe('getByIdOrThrow (inherited)', () => {
    it('throws NotFoundException for a missing id', async () => {
      model.findById.mockReturnValue(query(null));

      await expect(service.getByIdOrThrow('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
