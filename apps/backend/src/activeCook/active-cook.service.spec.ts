import { Logger, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { SmokeStatus } from '../smoke/smoke.schema';
import { FakeDoc, fakeModel } from '../timeline/testing/fake-model';
import { ActiveCookService } from './active-cook.service';

describe('ActiveCookService', () => {
  let service: ActiveCookService;
  let states: FakeDoc[];
  let smokes: FakeDoc[];

  /** The module over whatever the two collections currently hold. */
  const build = async (): Promise<void> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActiveCookService,
        { provide: getModelToken('state'), useValue: fakeModel(states) },
        { provide: getModelToken('Smoke'), useValue: fakeModel(smokes) },
      ],
    }).compile();
    service = module.get<ActiveCookService>(ActiveCookService);
  };

  beforeEach(() => {
    states = [];
    smokes = [];
  });

  describe('resolving the Active Cook', () => {
    it('answers with the cook the smoker is attached to and whether it is smoking', async () => {
      smokes.push({
        _id: 'cook-1',
        status: SmokeStatus.InProgress,
        preSmokeId: 'pre-1',
        tempsId: 'temps-1',
        restMinutes: 45,
      });
      states.push({ _id: 'state-1', smokeId: 'cook-1', smoking: true });
      await build();

      const cook = await service.resolve();

      expect(cook).toEqual({
        idle: false,
        smokeId: 'cook-1',
        smoking: true,
        smoke: expect.objectContaining({
          _id: 'cook-1',
          preSmokeId: 'pre-1',
          tempsId: 'temps-1',
          restMinutes: 45,
          status: SmokeStatus.InProgress,
        }),
      });
    });
  });

  describe('the "no Active Cook" rule', () => {
    it('is idle on a fresh install, where no state has been written yet', async () => {
      await build();

      expect(await service.resolve()).toEqual({ idle: true, smoking: false });
    });

    it('is idle when the state names no cook', async () => {
      states.push({ _id: 'state-1', smokeId: '', smoking: false });
      await build();

      expect(await service.resolve()).toEqual({ idle: true, smoking: false });
    });

    it('is idle when the cook the state names no longer exists', async () => {
      states.push({ _id: 'state-1', smokeId: 'deleted-cook', smoking: true });
      await build();

      expect(await service.resolve()).toEqual({ idle: true, smoking: true });
    });

    it('logs the cook that no longer exists, since nothing else notices', async () => {
      const logged = jest.spyOn(Logger, 'warn').mockImplementation();
      states.push({ _id: 'state-1', smokeId: 'deleted-cook', smoking: true });
      await build();

      await service.resolve();

      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining('deleted-cook'),
        'ActiveCook',
      );
    });
  });

  describe('reads never write', () => {
    it('leaves an empty store empty, rather than seeding a state document', async () => {
      await build();

      await service.resolve();

      expect(states).toEqual([]);
      expect(smokes).toEqual([]);
    });

    it('leaves a state naming a cook that no longer exists exactly as it was', async () => {
      jest.spyOn(Logger, 'warn').mockImplementation();
      states.push({ _id: 'state-1', smokeId: 'deleted-cook', smoking: true });
      await build();

      await service.resolve();

      expect(states).toEqual([
        { _id: 'state-1', smokeId: 'deleted-cook', smoking: true },
      ]);
    });
  });

  describe('attaching a child record', () => {
    /** A cook mid-session: scored, with a series, and a pull already stamped. */
    const attachedToACook = (): void => {
      smokes.push({
        _id: 'cook-1',
        status: SmokeStatus.InProgress,
        preSmokeId: 'pre-1',
        tempsId: 'temps-1',
        ratingId: 'rating-1',
      });
      states.push({ _id: 'state-1', smokeId: 'cook-1', smoking: true });
    };

    it('updates the record the cook already links, and links nothing new', async () => {
      attachedToACook();
      await build();
      const create = jest.fn();

      const result = await service.attach('tempsId', {
        update: async (childId) => `updated ${childId}`,
        create,
      });

      expect(result).toBe('updated temps-1');
      expect(create).not.toHaveBeenCalled();
      expect(smokes[0].tempsId).toBe('temps-1');
    });

    it('creates the record and links its id when the cook has none', async () => {
      attachedToACook();
      await build();

      const result = await service.attach('postSmokeId', {
        update: jest.fn(),
        create: async () => ({ result: 'the post-smoke', childId: 'post-new' }),
      });

      expect(result).toBe('the post-smoke');
      expect(smokes[0].postSmokeId).toBe('post-new');
    });

    /**
     * The link write names the one key it is attaching. Writing the whole
     * record back — which is how the old helper did it — republishes every
     * other link from a snapshot that may be minutes old, so a sibling
     * attached in between is lost.
     */
    it('keeps every other link on the cook, and its status', async () => {
      attachedToACook();
      await build();

      await service.attach('postSmokeId', {
        update: jest.fn(),
        create: async () => ({ result: 'the post-smoke', childId: 'post-new' }),
      });

      expect(smokes[0]).toEqual({
        _id: 'cook-1',
        status: SmokeStatus.InProgress,
        preSmokeId: 'pre-1',
        tempsId: 'temps-1',
        ratingId: 'rating-1',
        postSmokeId: 'post-new',
      });
    });

    it('raises not-found when there is no Active Cook to attach to', async () => {
      await build();
      const create = jest.fn();

      await expect(
        service.attach('postSmokeId', { update: jest.fn(), create }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(create).not.toHaveBeenCalled();
    });

    it('raises not-found with the message the routes have always answered', async () => {
      await build();

      await expect(
        service.attach('postSmokeId', {
          update: jest.fn(),
          create: jest.fn(),
        }),
      ).rejects.toThrow('No active smoke');
    });

    describe('the first-attach hook', () => {
      it('runs on the create path, with the cook it was attached to', async () => {
        attachedToACook();
        await build();
        const onFirstAttach = jest.fn();

        await service.attach('postSmokeId', {
          update: jest.fn(),
          create: async () => ({ result: 'created', childId: 'post-new' }),
          onFirstAttach,
        });

        expect(onFirstAttach).toHaveBeenCalledTimes(1);
        expect(onFirstAttach).toHaveBeenCalledWith(
          expect.objectContaining({
            smokeId: 'cook-1',
            smoke: expect.objectContaining({ ratingId: 'rating-1' }),
          }),
        );
      });

      it('does not run when the record was already linked', async () => {
        attachedToACook();
        await build();
        const onFirstAttach = jest.fn();

        await service.attach('tempsId', {
          update: async () => 'updated',
          create: jest.fn(),
          onFirstAttach,
        });

        expect(onFirstAttach).not.toHaveBeenCalled();
      });

      /**
       * The hook runs after the link is written, so what it does next — the
       * ratings seed reads the cook again — sees a cook that already carries
       * the child it was attached for, rather than seeding a second one.
       */
      it('runs once the link is on the cook', async () => {
        attachedToACook();
        await build();
        let linkedWhenCalled: unknown;

        await service.attach('postSmokeId', {
          update: jest.fn(),
          create: async () => ({ result: 'created', childId: 'post-new' }),
          onFirstAttach: () => {
            linkedWhenCalled = smokes[0].postSmokeId;
          },
        });

        expect(linkedWhenCalled).toBe('post-new');
      });
    });
  });
});
