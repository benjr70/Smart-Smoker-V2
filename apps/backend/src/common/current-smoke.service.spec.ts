import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CurrentSmokeService } from './current-smoke.service';
import { StateService } from '../State/state.service';
import { SmokeService } from '../smoke/smoke.service';
import { SmokeStatus } from '../smoke/smoke.schema';

describe('CurrentSmokeService', () => {
  let service: CurrentSmokeService;
  let stateService: jest.Mocked<Partial<StateService>>;
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
    stateService = {
      GetState: jest
        .fn()
        .mockResolvedValue({ smokeId: 'smoke-1', smoking: true }),
      create: jest.fn().mockResolvedValue({ smokeId: '', smoking: false }),
    };
    smokeService = {
      getById: jest.fn().mockResolvedValue(activeSmoke),
      update: jest.fn().mockResolvedValue(activeSmoke),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrentSmokeService,
        { provide: StateService, useValue: stateService },
        { provide: SmokeService, useValue: smokeService },
      ],
    }).compile();

    service = module.get<CurrentSmokeService>(CurrentSmokeService);
  });

  describe('currentSmoke', () => {
    it('self-heals a missing state document and returns null when nothing is active', async () => {
      stateService.GetState.mockResolvedValue(undefined);

      const result = await service.currentSmoke();

      expect(stateService.create).toHaveBeenCalledWith({
        smokeId: '',
        smoking: false,
      });
      expect(result).toBeNull();
    });

    it('loads the smoke referenced by the active state', async () => {
      expect(await service.currentSmoke()).toEqual(activeSmoke);
      expect(smokeService.getById).toHaveBeenCalledWith('smoke-1');
    });
  });

  describe('readCurrent', () => {
    const fallback = { note: 'default' };

    it('returns the fallback when there is no active smoke', async () => {
      stateService.GetState.mockResolvedValue({ smokeId: '', smoking: false });
      const load = jest.fn();

      const result = await service.readCurrent('postSmokeId', load, fallback);

      expect(result).toBe(fallback);
      expect(load).not.toHaveBeenCalled();
    });

    it('returns the fallback when the active smoke has no child of that key', async () => {
      smokeService.getById.mockResolvedValue({
        ...activeSmoke,
        postSmokeId: undefined,
      } as any);
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
  });

  describe('upsertCurrent', () => {
    it('throws NotFoundException when there is no active smoke', async () => {
      stateService.GetState.mockResolvedValue({ smokeId: '', smoking: false });

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
      smokeService.getById.mockResolvedValue({
        ...activeSmoke,
        postSmokeId: undefined,
      } as any);
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
      smokeService.getById.mockResolvedValue({
        ...activeSmoke,
        postSmokeId: undefined,
      } as any);
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
