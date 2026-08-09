import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CurrentSmokeService } from './current-smoke.service';
import { StateService } from '../State/state.service';
import { SmokeService } from '../smoke/smoke.service';
import { SmokeStatus } from '../smoke/smoke.schema';

describe('CurrentSmokeService', () => {
  let service: CurrentSmokeService;
  // Collaborators are stubbed as bare jest mocks: the real signatures return
  // Mongoose documents, and `jest.Mocked<Partial<Service>>` would make every
  // member optional — forcing a `?.` or `!` at each stubbing site instead of
  // saying what these actually are.
  let stateService: { GetState: jest.Mock; create: jest.Mock };
  let smokeService: { getById: jest.Mock; update: jest.Mock };

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

    /**
     * The smoke still carries the foreign key but the child row is gone —
     * a deleted document, or a half-written aggregate. That is the same
     * "nothing to show" situation as an unlinked key, so it resolves to the
     * fallback rather than handing the caller a null it was never told about.
     */
    it('returns the fallback when the linked child no longer exists', async () => {
      const load = jest.fn().mockResolvedValue(null);

      const result = await service.readCurrent('postSmokeId', load, fallback);

      expect(load).toHaveBeenCalledWith('post-1');
      expect(result).toBe(fallback);
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

    /**
     * The smoke still carries the foreign key but the child row is gone, so
     * the update lands on nothing. `readCurrent` already calls that "nothing
     * active" and answers the fallback; the write path agrees by creating a
     * fresh child and relinking it, instead of 404-ing forever on a form the
     * client was just served with a 200.
     */
    it('recreates and relinks the child when the linked id is dangling', async () => {
      const update = jest
        .fn()
        .mockRejectedValue(new NotFoundException('PostSmoke post-1 not found'));
      const created = { note: 'recreated' };
      const create = jest
        .fn()
        .mockResolvedValue({ result: created, childId: 'post-new' });

      const result = await service.upsertCurrent('postSmokeId', {
        update,
        create,
      });

      expect(update).toHaveBeenCalledWith('post-1');
      expect(result).toBe(created);
      expect(smokeService.update).toHaveBeenCalledWith(
        'smoke-1',
        expect.objectContaining({
          postSmokeId: 'post-new',
          preSmokeId: 'pre-1',
          tempsId: 'temps-1',
        }),
      );
    });

    it('propagates a non-404 failure from the update path', async () => {
      const update = jest.fn().mockRejectedValue(new Error('Database error'));
      const create = jest.fn();

      await expect(
        service.upsertCurrent('postSmokeId', { update, create }),
      ).rejects.toThrow('Database error');
      expect(create).not.toHaveBeenCalled();
      expect(smokeService.update).not.toHaveBeenCalled();
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
