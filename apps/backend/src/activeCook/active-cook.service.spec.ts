import { Logger, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationSettings } from '../appSettings/app-settings.schema';
import { SmokeStatus } from '../smoke/smoke.schema';
import {
  fakeStatsRecompute,
  FakeStatsRecompute,
  statsRecomputeProvider,
} from '../stats/testing/fake-stats-recompute';
import { FakeDoc, fakeModel } from '../timeline/testing/fake-model';
import { ActiveCookService } from './active-cook.service';

describe('ActiveCookService', () => {
  let service: ActiveCookService;
  let states: FakeDoc[];
  let smokes: FakeDoc[];
  let readings: FakeDoc[];
  let settings: FakeDoc[];
  let stats: FakeStatsRecompute;

  /** The module over whatever the collections currently hold. */
  const build = async (): Promise<void> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActiveCookService,
        { provide: getModelToken('state'), useValue: fakeModel(states) },
        { provide: getModelToken('Smoke'), useValue: fakeModel(smokes) },
        { provide: getModelToken('Temp'), useValue: fakeModel(readings) },
        {
          provide: getModelToken(ApplicationSettings.name),
          useValue: fakeModel(settings),
        },
        statsRecomputeProvider(stats),
      ],
    }).compile();
    service = module.get<ActiveCookService>(ActiveCookService);
  };

  beforeEach(() => {
    states = [];
    smokes = [];
    readings = [];
    settings = [];
    stats = fakeStatsRecompute();
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

  describe('starting a cook', () => {
    /** A pre-smoke written as the cook is created, as its module writes one. */
    const aPreSmoke = () =>
      jest.fn(async () => ({ result: { meat: 'brisket' }, childId: 'pre-1' }));

    it('creates the cook from a pre-smoke and attaches it to the smoker', async () => {
      states.push({ _id: 'state-1', smokeId: '', smoking: false });
      await build();

      const started = await service.start(aPreSmoke());

      expect(started.won).toBe(true);
      expect(started.preSmoke).toEqual({ meat: 'brisket' });
      expect(smokes).toHaveLength(1);
      expect(smokes[0]).toEqual(
        expect.objectContaining({
          preSmokeId: 'pre-1',
          status: SmokeStatus.InProgress,
        }),
      );
      expect(states[0].smokeId).toBe(String(smokes[0]._id));
    });

    it('is lost, and writes nothing, when a cook is already attached', async () => {
      smokes.push({ _id: 'cook-1', status: SmokeStatus.InProgress });
      states.push({ _id: 'state-1', smokeId: 'cook-1', smoking: true });
      await build();
      const preSmoke = aPreSmoke();

      const started = await service.start(preSmoke);

      expect(started.won).toBe(false);
      expect(started.preSmoke).toBeNull();
      expect(preSmoke).not.toHaveBeenCalled();
      expect(started.cook).toEqual(
        expect.objectContaining({ idle: false, smokeId: 'cook-1' }),
      );
      expect(smokes).toHaveLength(1);
    });

    /**
     * Two phones setting a cook up together leave one cook behind, not two with
     * the smoker attached to whichever wrote last — and one pre-smoke, since
     * the loser never writes one to be orphaned.
     */
    it('is one cook when two starts race', async () => {
      states.push({ _id: 'state-1', smokeId: '', smoking: false });
      await build();
      const first = aPreSmoke();
      const second = aPreSmoke();

      const starts = await Promise.all([
        service.start(first),
        service.start(second),
      ]);

      expect(starts.filter((start) => start.won)).toHaveLength(1);
      expect(smokes).toHaveLength(1);
      expect(
        [first, second].filter((create) => create.mock.calls.length > 0),
      ).toHaveLength(1);
      expect(states[0].smokeId).toBe(String(smokes[0]._id));
    });

    /**
     * A state left pointing at a cook that has since been deleted reads as
     * idle, so the next start claims that slot rather than being refused on
     * behalf of a cook nobody can see.
     */
    it('claims a smoker left pointing at a cook that no longer exists', async () => {
      jest.spyOn(Logger, 'warn').mockImplementation();
      states.push({ _id: 'state-1', smokeId: 'deleted-cook', smoking: false });
      await build();

      const started = await service.start(aPreSmoke());

      expect(started.won).toBe(true);
      expect(states[0].smokeId).toBe(String(smokes[0]._id));
    });
  });

  describe('toggling smoking', () => {
    /** A cook attached to the smoker, not yet lit. */
    const anUnlitCook = (): void => {
      smokes.push({
        _id: 'cook-1',
        status: SmokeStatus.InProgress,
        tempsId: 'temps-1',
      });
      states.push({ _id: 'state-1', smokeId: 'cook-1', smoking: false });
    };

    it('switches smoking on and records that the cook has started', async () => {
      anUnlitCook();
      await build();

      const toggled = await service.toggle();

      expect(toggled.won).toBe(true);
      expect(states[0].smoking).toBe(true);
      expect(smokes[0].startedAt).toBeInstanceOf(Date);
    });

    it('leaves the start where it was when smoking goes off and on again', async () => {
      anUnlitCook();
      await build();

      await service.toggle();
      const started = smokes[0].startedAt;
      await service.toggle();
      await service.toggle();

      expect(states[0].smoking).toBe(true);
      expect(smokes[0].startedAt).toBe(started);
    });

    /**
     * Two presses that overlap are still one on and one off, and the start is
     * stamped once. The flip is computed where the flag lives, so neither call
     * can act on a value the other has already moved — which is how the
     * read-negate-write it replaced lost a Stop.
     */
    it('is two presses, on then off, when two callers race', async () => {
      anUnlitCook();
      await build();

      await Promise.all([service.toggle(), service.toggle()]);

      expect(states[0].smoking).toBe(false);
      expect(smokes[0].startedAt).toBeInstanceOf(Date);
    });

    it('is lost, with the idle cook back, when no cook is attached', async () => {
      states.push({ _id: 'state-1', smokeId: '', smoking: false });
      await build();

      const toggled = await service.toggle();

      expect(toggled).toEqual({
        won: false,
        cook: { idle: true, smoking: false },
        state: null,
      });
      expect(states[0].smoking).toBe(false);
    });

    it('answers with the stored state, which is what the toggle route serves', async () => {
      anUnlitCook();
      await build();

      const toggled = await service.toggle();

      expect(toggled.state).toEqual(
        expect.objectContaining({ smokeId: 'cook-1', smoking: true }),
      );
    });
  });

  describe('pulling the meat', () => {
    /** A cook running, with a watched probe reading 198°F. */
    const aCookOnTheSmoker = (): void => {
      smokes.push({
        _id: 'cook-1',
        status: SmokeStatus.InProgress,
        tempsId: 'temps-1',
      });
      states.push({ _id: 'state-1', smokeId: 'cook-1', smoking: true });
      readings.push({
        tempsId: 'temps-1',
        date: new Date('2026-01-01T12:00:00Z'),
        MeatTemp: '198',
      });
      settings.push({
        _id: 'settings-1',
        probeTarget: {
          enabled: true,
          probes: [{ slot: 'probe1', enabled: true, target: 203 }],
        },
      });
    };

    it('stamps when the meat came off and how hot it was', async () => {
      aCookOnTheSmoker();
      await build();

      const pulled = await service.pull();

      expect(pulled.won).toBe(true);
      expect(smokes[0].pullAt).toBeInstanceOf(Date);
      expect(smokes[0].pullTemp).toBe(198);
    });

    /**
     * A second tap of the step control must not move the pull: everything the
     * rest is measured from — the countdown, the carryover, the safe-to-hold
     * window — hangs off this one moment, and moving it restarts a rest that is
     * already half over.
     */
    it('keeps the first pull time when it is pulled again', async () => {
      aCookOnTheSmoker();
      await build();
      await service.pull();
      const first = smokes[0].pullAt;
      readings[0].MeatTemp = '120';

      const again = await service.pull();

      expect(again.won).toBe(false);
      expect(smokes[0].pullAt).toEqual(first);
      expect(smokes[0].pullTemp).toBe(198);
    });

    it('hands the cook back to the caller that lost', async () => {
      aCookOnTheSmoker();
      await build();
      await service.pull();

      const again = await service.pull();

      expect(again.cook).toEqual(
        expect.objectContaining({ idle: false, smokeId: 'cook-1' }),
      );
    });

    it('is lost on an idle smoker, with nothing stamped', async () => {
      await build();

      expect(await service.pull()).toEqual({
        won: false,
        cook: { idle: true, smoking: false },
      });
    });
  });

  describe('finishing the cook', () => {
    /** A cook the pitmaster is ending: running, with a series behind it. */
    const aCookBeingEnded = (): void => {
      smokes.push({
        _id: 'cook-1',
        status: SmokeStatus.InProgress,
        tempsId: 'temps-1',
        preSmokeId: 'pre-1',
      });
      states.push({ _id: 'state-1', smokeId: 'cook-1', smoking: true });
      readings.push({
        tempsId: 'temps-1',
        date: new Date('2026-01-01T12:00:00Z'),
        ChamberTemp: '255',
      });
    };

    it('stamps the cook, marks it complete and recomputes the statistics', async () => {
      aCookBeingEnded();
      await build();

      const finished = await service.finish();

      expect(finished.won).toBe(true);
      expect(smokes[0].finishedAt).toBeInstanceOf(Date);
      expect(smokes[0].status).toBe(SmokeStatus.Complete);
      expect(smokes[0].peakChamber).toBe(255);
      expect(stats.recompute).toHaveBeenCalledTimes(1);
    });

    it('is one stamp and one recompute when two finishes race', async () => {
      aCookBeingEnded();
      await build();

      const [first, second] = await Promise.all([
        service.finish(),
        service.finish(),
      ]);

      expect([first.won, second.won].filter(Boolean)).toHaveLength(1);
      expect(stats.recompute).toHaveBeenCalledTimes(1);
      expect(smokes[0].status).toBe(SmokeStatus.Complete);
    });

    it('hands the cook back to the finish that lost, not an error', async () => {
      aCookBeingEnded();
      await build();
      await service.finish();

      const again = await service.finish();

      expect(again.won).toBe(false);
      expect(again.cook).toEqual(
        expect.objectContaining({ idle: false, smokeId: 'cook-1' }),
      );
      expect(stats.recompute).toHaveBeenCalledTimes(1);
    });

    /**
     * The finish is committed before the statistics are asked for, and a
     * pitmaster who presses End Smoke cannot be told their cook did not end
     * because a screen they are not looking at could not be recounted.
     */
    it('succeeds when the statistics cannot be recomputed', async () => {
      aCookBeingEnded();
      stats.recompute.mockRejectedValue(new Error('mongo is away'));
      const logged = jest.spyOn(Logger, 'warn').mockImplementation();
      await build();

      const finished = await service.finish();

      expect(finished.won).toBe(true);
      expect(smokes[0].status).toBe(SmokeStatus.Complete);
      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining('cook-1'),
        'ActiveCook',
      );
    });

    /**
     * An auto-stop ends a cook's record but deliberately leaves it in progress,
     * so the pitmaster still walks the End Smoke wizard. That late finish keeps
     * the honest stamp and is still the call that completes the cook.
     */
    it('keeps an auto-stopped cook’s finish and still completes it', async () => {
      const autoStopped = new Date('2026-01-01T18:00:00Z');
      aCookBeingEnded();
      smokes[0].finishedAt = autoStopped;
      await build();

      const finished = await service.finish();

      expect(finished.won).toBe(true);
      expect(smokes[0].finishedAt).toEqual(autoStopped);
      expect(smokes[0].status).toBe(SmokeStatus.Complete);
      expect(stats.recompute).toHaveBeenCalledTimes(1);
    });

    it('is lost on an idle smoker, and recomputes nothing', async () => {
      await build();

      expect(await service.finish()).toEqual({
        won: false,
        cook: { idle: true, smoking: false },
      });
      expect(stats.recompute).not.toHaveBeenCalled();
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
