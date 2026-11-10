import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CurrentSmokeService } from './current-smoke.service';
import { idleCook } from '../activeCook/active-cook';
import { ActiveCookService } from '../activeCook/active-cook.service';
import {
  attachedCook,
  FakeActiveCook,
  fakeActiveCook,
} from '../activeCook/testing/fake-active-cook';
import { SmokeService } from '../smoke/smoke.service';
import { SmokeStatus } from '../smoke/smoke.schema';

describe('CurrentSmokeService', () => {
  let service: CurrentSmokeService;
  let activeCook: FakeActiveCook;
  let smokeService: jest.Mocked<Partial<SmokeService>>;

  const activeSmoke = {
    _id: 'smoke-1',
    preSmokeId: 'pre-1',
    postSmokeId: 'post-1',
    smokeProfileId: 'profile-1',
    tempsId: 'temps-1',
    ratingId: 'rating-1',
    date: new Date('2023-01-01'),
    status: SmokeStatus.InProgress,
  };

  beforeEach(async () => {
    activeCook = fakeActiveCook(attachedCook(activeSmoke, true));
    smokeService = {
      getById: jest.fn().mockResolvedValue(activeSmoke),
      update: jest.fn().mockResolvedValue(activeSmoke),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrentSmokeService,
        { provide: ActiveCookService, useValue: activeCook },
        { provide: SmokeService, useValue: smokeService },
      ],
    }).compile();

    service = module.get<CurrentSmokeService>(CurrentSmokeService);
  });

  describe('currentSmoke', () => {
    it('answers nothing for an idle smoker, and heals nothing as it reads', async () => {
      activeCook.pointAt(idleCook());

      expect(await service.currentSmoke()).toBeNull();
    });

    it('answers with the Active Cook', async () => {
      expect(await service.currentSmoke()).toEqual(activeSmoke);
      // Asked of the one module that owns the question, rather than walked to
      // from the stored state a second time.
      expect(activeCook.resolve).toHaveBeenCalled();
      expect(smokeService.getById).not.toHaveBeenCalled();
    });
  });

  describe('readCurrent', () => {
    const fallback = { note: 'default' };

    it('returns the fallback when there is no active smoke', async () => {
      activeCook.pointAt(idleCook());
      const load = jest.fn();

      const result = await service.readCurrent('postSmokeId', load, fallback);

      expect(result).toBe(fallback);
      expect(load).not.toHaveBeenCalled();
    });

    it('returns the fallback when the active smoke has no child of that key', async () => {
      activeCook.pointAt(
        attachedCook({ ...activeSmoke, postSmokeId: undefined }),
      );
      const load = jest.fn();

      const result = await service.readCurrent('postSmokeId', load, fallback);

      expect(result).toBe(fallback);
      expect(load).not.toHaveBeenCalled();
    });

    it('loads the child when it exists', async () => {
      const child = { note: 'loaded' };
      const load = jest.fn().mockResolvedValue(child);

      const result = await service.readCurrent('postSmokeId', load, fallback);

      expect(load).toHaveBeenCalledWith('post-1');
      expect(result).toBe(child);
    });

    /**
     * The caller already resolved the Active Cook and is passing it down — the
     * alert check, which judges one reading against one cook. A read that went
     * and resolved its own could answer about a different cook.
     */
    it('reads the child of a cook it was handed, resolving none of its own', async () => {
      const load = jest.fn().mockResolvedValue({ note: 'loaded' });
      const handed = attachedCook({ ...activeSmoke, postSmokeId: 'post-9' });

      await service.readCurrent('postSmokeId', load, fallback, handed);

      expect(load).toHaveBeenCalledWith('post-9');
      expect(activeCook.resolve).not.toHaveBeenCalled();
    });

    it('answers the fallback for a handed-down idle smoker', async () => {
      const load = jest.fn();

      const result = await service.readCurrent(
        'postSmokeId',
        load,
        fallback,
        idleCook(),
      );

      expect(result).toBe(fallback);
      expect(load).not.toHaveBeenCalled();
      expect(activeCook.resolve).not.toHaveBeenCalled();
    });
  });

  describe('upsertCurrent', () => {
    it('throws NotFoundException when there is no active smoke', async () => {
      activeCook.pointAt(idleCook());

      await expect(
        service.upsertCurrent('postSmokeId', {
          update: jest.fn(),
          create: jest.fn(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates the existing child in place when the key is already linked', async () => {
      const updated = { note: 'updated' };
      const update = jest.fn().mockResolvedValue(updated);
      const create = jest.fn();

      const result = await service.upsertCurrent('postSmokeId', {
        update,
        create,
      });

      expect(update).toHaveBeenCalledWith('post-1');
      expect(create).not.toHaveBeenCalled();
      expect(smokeService.update).not.toHaveBeenCalled();
      expect(result).toBe(updated);
    });

    it('creates the child and links its id back onto the smoke, preserving siblings', async () => {
      activeCook.pointAt(
        attachedCook({ ...activeSmoke, postSmokeId: undefined }),
      );
      const created = { note: 'created' };
      const create = jest
        .fn()
        .mockResolvedValue({ result: created, childId: 'post-new' });

      const result = await service.upsertCurrent('postSmokeId', {
        update: jest.fn(),
        create,
      });

      expect(result).toBe(created);
      expect(smokeService.update).toHaveBeenCalledWith(
        'smoke-1',
        expect.objectContaining({
          postSmokeId: 'post-new',
          preSmokeId: 'pre-1',
          tempsId: 'temps-1',
          smokeProfileId: 'profile-1',
          ratingId: 'rating-1',
          status: SmokeStatus.InProgress,
        }),
      );
    });

    it('invokes onResolveSmoke when provided on the create path', async () => {
      activeCook.pointAt(
        attachedCook({ ...activeSmoke, postSmokeId: undefined }),
      );
      const onResolveSmoke = jest.fn();

      await service.upsertCurrent('postSmokeId', {
        update: jest.fn(),
        create: jest
          .fn()
          .mockResolvedValue({ result: {}, childId: 'post-new' }),
        onResolveSmoke,
      });

      expect(onResolveSmoke).toHaveBeenCalled();
    });
  });
});
