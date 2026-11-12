import { Logger, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationSettings } from '../appSettings/app-settings.schema';
import { fakeCollection } from '../cookEvents/testing/fake-collection';
import {
  fakePushNotice,
  FakePushNotice,
  pushNoticeProvider,
} from '../pushDispatcher/testing/fake-push-notice';
import { SmokeStatus } from '../smoke/smoke.schema';
import {
  fakeStatsRecompute,
  FakeStatsRecompute,
  statsRecomputeProvider,
} from '../stats/testing/fake-stats-recompute';
import { FakeDoc, fakeModel } from '../timeline/testing/fake-model';
import {
  cookBroadcastProvider,
  fakeCookBroadcast,
  FakeCookBroadcast,
} from '../websocket/testing/fake-cook-broadcast';
import { ActiveCookService } from './active-cook.service';

describe('ActiveCookService', () => {
  let service: ActiveCookService;
  let states: FakeDoc[];
  let smokes: FakeDoc[];
  let readings: FakeDoc[];
  let settings: FakeDoc[];
  /** The cook log: the rows a discarded cook's clear throws away. */
  let cookEvents: FakeDoc[];
  /** What the cook's probes are called, as a stop announcement carries them. */
  let profiles: FakeDoc[];
  let stats: FakeStatsRecompute;
  /** The socket every open app is listening on. */
  let broadcast: FakeCookBroadcast;
  /** The phones: what reaches a pitmaster who is nowhere near the box. */
  let push: FakePushNotice;
  /**
   * The state collection's model, held so a test can make one write fail the
   * way the store fails it — a refusal is not something an array can produce.
   */
  let stateModel: ReturnType<typeof fakeModel>;
  /** The cook log's model, held for the same reason the state's is. */
  let cookEventModel: ReturnType<typeof fakeCollection>;
  /**
   * The archive's model, held so a test can let a write land and then move the
   * world underneath the transition that made it — which is the only way to
   * stand between two of its writes.
   */
  let smokeModel: ReturnType<typeof fakeModel>;

  /** The module over whatever the collections currently hold. */
  const build = async (): Promise<void> => {
    stateModel = fakeModel(states);
    cookEventModel = fakeCollection(cookEvents);
    smokeModel = fakeModel(smokes);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActiveCookService,
        { provide: getModelToken('state'), useValue: stateModel },
        { provide: getModelToken('Smoke'), useValue: smokeModel },
        { provide: getModelToken('Temp'), useValue: fakeModel(readings) },
        {
          provide: getModelToken(ApplicationSettings.name),
          useValue: fakeModel(settings),
        },
        // The cook log through the fake that removes rows by a filter, which is
        // how a discarded cook's log goes.
        { provide: getModelToken('CookEvent'), useValue: cookEventModel },
        {
          provide: getModelToken('SmokeProfile'),
          useValue: fakeModel(profiles),
        },
        statsRecomputeProvider(stats),
        cookBroadcastProvider(broadcast),
        pushNoticeProvider(push),
      ],
    }).compile();
    service = module.get<ActiveCookService>(ActiveCookService);
  };

  beforeEach(() => {
    states = [];
    smokes = [];
    readings = [];
    settings = [];
    cookEvents = [];
    profiles = [];
    stats = fakeStatsRecompute();
    broadcast = fakeCookBroadcast();
    push = fakePushNotice();
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

  /**
   * The stored singleton itself, which is what the get-state route has always
   * answered with — the flag the apps hold and the cook they hold it for, in
   * the shape they have always read it in.
   */
  describe('the stored state', () => {
    it('answers with the singleton as it stands', async () => {
      states.push({ _id: 'state-1', smokeId: 'cook-1', smoking: true });
      await build();

      expect(await service.state()).toEqual(
        expect.objectContaining({ smokeId: 'cook-1', smoking: true }),
      );
    });

    it('answers with nothing on a box that has never held one', async () => {
      await build();

      expect(await service.state()).toBeNull();
    });

    it('writes nothing, not even the singleton it did not find', async () => {
      await build();

      await service.state();

      expect(states).toEqual([]);
    });
  });

  /**
   * A fresh install — a new production database, or any freshly booted
   * hermetic stack — has an empty state collection, and a reader with nothing
   * to read has to invent its own handling for it. Seeding the singleton once
   * at startup is what lets reading the Active Cook never write, which is the
   * whole reason the self-heal could go.
   */
  describe('seeding the state at startup', () => {
    it('writes the idle singleton when the collection is empty', async () => {
      await build();

      await service.onModuleInit();

      expect(states).toEqual([
        expect.objectContaining({ smokeId: '', smoking: false }),
      ]);
      expect(await service.resolve()).toEqual({ idle: true, smoking: false });
    });

    // The backend restarting in the middle of a cook must not put it out.
    it('leaves a state that is already there exactly as it was', async () => {
      states.push({ _id: 'state-1', smokeId: 'cook-1', smoking: true });
      await build();

      await service.onModuleInit();

      expect(states).toEqual([
        { _id: 'state-1', smokeId: 'cook-1', smoking: true },
      ]);
    });

    /**
     * Two boxes (or two instances) coming up together contend on the `_id`
     * index rather than both inserting, so a smoker is never left with two
     * state documents, each read as "the" state by whichever query finds it
     * first.
     */
    it('is one state document when two boots race', async () => {
      await build();

      await Promise.all([service.onModuleInit(), service.onModuleInit()]);

      expect(states).toHaveLength(1);
    });

    // A database that is not up yet must not stop the API from booting.
    it('logs and does not throw when the store cannot be reached', async () => {
      const errorSpy = jest.spyOn(Logger, 'error').mockImplementation();
      await build();
      stateModel.findOne = () =>
        ({
          exec: async () => {
            throw new Error('no primary available');
          },
        } as any);

      await expect(service.onModuleInit()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('no primary available'),
        'ActiveCook',
      );
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
     * A smoker with no state document at all — a fresh install whose boot
     * seeding could not reach the database — is claimed by writing one, and
     * left unlit: setting a cook up is not lighting the smoker.
     */
    it('claims a smoker whose state document was never written', async () => {
      await build();

      const started = await service.start(aPreSmoke());

      expect(started.won).toBe(true);
      expect(states).toHaveLength(1);
      expect(states[0].smokeId).toBe(String(smokes[0]._id));
      expect(states[0].smoking).toBe(false);
    });

    /**
     * The same race, on that unwritten smoker. Both starts read no state at
     * all, so the claim cannot be conditional on the value one of them read —
     * only the call that *creates* the state document may start a cook, or the
     * second one overwrites the first's claim and orphans its cook.
     */
    it('is one cook when two starts race on a smoker with no state document', async () => {
      await build();
      const first = aPreSmoke();
      const second = aPreSmoke();

      const starts = await Promise.all([
        service.start(first),
        service.start(second),
      ]);

      expect(starts.filter((start) => start.won)).toHaveLength(1);
      expect(states).toHaveLength(1);
      expect(smokes).toHaveLength(1);
      expect(states[0].smokeId).toBe(String(smokes[0]._id));
    });

    /**
     * The store's own refusal of the second insert — two starts whose claims
     * reach an unwritten smoker at the same instant contend on the `_id`
     * index. The loser is handed the cook, not the duplicate-key error.
     */
    it('is lost, and writes no cook, when the store refuses the claim as a duplicate', async () => {
      await build();
      jest.spyOn(stateModel, 'updateOne').mockReturnValue({
        exec: async () => {
          throw Object.assign(new Error('E11000 duplicate key error'), {
            code: 11000,
          });
        },
      } as ReturnType<typeof stateModel.updateOne>);
      const preSmoke = aPreSmoke();

      const started = await service.start(preSmoke);

      expect(started.won).toBe(false);
      expect(started.preSmoke).toBeNull();
      expect(preSmoke).not.toHaveBeenCalled();
      expect(smokes).toEqual([]);
    });

    /** Anything else the store refuses a claim with is nobody's loss to read. */
    it('lets an unrecognised write failure out rather than reading it as a loss', async () => {
      await build();
      jest.spyOn(stateModel, 'updateOne').mockReturnValue({
        exec: async () => {
          throw new Error('not primary');
        },
      } as ReturnType<typeof stateModel.updateOne>);

      await expect(service.start(aPreSmoke())).rejects.toThrow('not primary');
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

  describe('stopping an abandoned cook', () => {
    /** Where the readings of an abandoned cook stopped. */
    const LAST_READING = new Date('2026-08-01T15:55:00.000Z');
    /** The sentence the staleness rule hands over for the pitmaster. */
    const NOTICE = 'Cook auto-stopped after 6 hours idle';

    /** A cook still marked as running whose readings stopped yesterday. */
    const anAbandonedCook = (): void => {
      smokes.push({
        _id: 'cook-1',
        status: SmokeStatus.InProgress,
        tempsId: 'temps-1',
        startedAt: new Date('2026-08-01T10:00:00.000Z'),
      });
      states.push({ _id: 'state-1', smokeId: 'cook-1', smoking: true });
      readings.push({
        tempsId: 'temps-1',
        date: LAST_READING,
        ChamberTemp: '244',
      });
    };

    it('stamps the finish where the readings stopped and switches smoking off', async () => {
      anAbandonedCook();
      await build();

      const stopped = await service.autoStop(LAST_READING, NOTICE);

      expect(stopped.won).toBe(true);
      expect(smokes[0].finishedAt).toEqual(LAST_READING);
      expect(states[0].smoking).toBe(false);
    });

    /**
     * Stopping is not completing: the wizard — post-smoke notes, the rating —
     * is still ahead of the pitmaster, so the cook stays in progress and the
     * smoker stays attached to it for whenever they next open the app.
     */
    it('leaves the cook in progress and still attached to the smoker', async () => {
      anAbandonedCook();
      await build();

      await service.autoStop(LAST_READING, NOTICE);

      expect(smokes[0].status).toBe(SmokeStatus.InProgress);
      expect(states[0].smokeId).toBe('cook-1');
    });

    /**
     * The pitmaster walks up to the box in the window this stop is open: they
     * clear the abandoned cook and light a new one. A stop decided about
     * yesterday's cook may not switch off the cook they have just started —
     * the flip is conditional on the smoker still being attached to the cook
     * the stop is about, not merely on something smoking.
     *
     * Their clear and start are applied from inside the stamp write, because
     * that is the one place between this transition's two writes a test can
     * stand: the stamp has landed, the flip has not been issued.
     */
    it('leaves a cook the pitmaster has since started alone', async () => {
      anAbandonedCook();
      await build();
      const stampWrite = smokeModel.updateOne.bind(smokeModel);
      jest
        .spyOn(smokeModel, 'updateOne')
        .mockImplementation((filter, update, options) => {
          const write = stampWrite(filter, update, options);
          return {
            async exec() {
              const result = await write.exec();
              smokes.push({
                _id: 'cook-2',
                status: SmokeStatus.InProgress,
                tempsId: 'temps-2',
              });
              states[0].smokeId = 'cook-2';
              states[0].smoking = true;
              return result;
            },
          } as ReturnType<typeof smokeModel.updateOne>;
        });

      await service.autoStop(LAST_READING, NOTICE);

      expect(smokes[0].finishedAt).toEqual(LAST_READING);
      expect(states[0].smokeId).toBe('cook-2');
      expect(states[0].smoking).toBe(true);
      expect(broadcast.broadcastSmokeUpdate).not.toHaveBeenCalled();
    });

    /**
     * A stopped cook has joined the archive as far as the numbers are
     * concerned: its honest duration is one of the things they are made of. The
     * recompute is the Active Cook's, through the one port — the staleness rule
     * used to keep a second copy of it.
     */
    it('recounts the archive once, for the stop that won', async () => {
      anAbandonedCook();
      await build();

      await Promise.all([
        service.autoStop(LAST_READING, NOTICE),
        service.autoStop(LAST_READING, NOTICE),
      ]);

      expect(stats.recompute).toHaveBeenCalledTimes(1);
    });

    it('leaves the archive alone when there was nothing to stop', async () => {
      anAbandonedCook();
      smokes[0].finishedAt = new Date('2026-08-01T15:00:00.000Z');
      await build();

      await service.autoStop(LAST_READING, NOTICE);

      expect(stats.recompute).not.toHaveBeenCalled();
    });

    /**
     * A stop nobody is told about is half a stop.
     *
     * The apps hold the smoking flag in memory and only ever learn it changed
     * from the socket. A kiosk still showing the abandoned cook believes it is
     * running, and Stop on that screen is a *toggle*: it reads the stored
     * `false` and flips it back to `true`, restarting the very cook this just
     * ended. So the flip rides the same event a client's own flip does,
     * carrying the cook's names because that is what the frame is.
     */
    describe('telling the apps the cook has stopped', () => {
      /** The cook's probes, as its profile names them. */
      const aNamedProfile = (): void => {
        smokes[0].smokeProfileId = 'profile-1';
        profiles.push({
          _id: 'profile-1',
          chamberName: 'Pit',
          probe1Name: 'Brisket',
          probe2Name: 'Ribs',
          probe3Name: 'Spare',
        });
      };

      it('announces the flip so a stale client cannot toggle the cook back on', async () => {
        anAbandonedCook();
        aNamedProfile();
        await build();

        await service.autoStop(LAST_READING, NOTICE);

        expect(broadcast.broadcastSmokeUpdate).toHaveBeenCalledWith({
          smoking: false,
          chamberName: 'Pit',
          probe1Name: 'Brisket',
          probe2Name: 'Ribs',
          probe3Name: 'Spare',
        });
      });

      // The names ride along on this frame and the apps apply them, so a cook
      // whose profile was never written must be told the names it would be
      // given on a fresh read rather than blanks that would wipe the labels.
      it('announces the default names for a cook whose profile was never written', async () => {
        anAbandonedCook();
        smokes[0].smokeProfileId = 'profile-1';
        await build();

        await service.autoStop(LAST_READING, NOTICE);

        expect(broadcast.broadcastSmokeUpdate).toHaveBeenCalledWith({
          smoking: false,
          chamberName: 'Chamber',
          probe1Name: 'Probe1',
          probe2Name: 'Probe2',
          probe3Name: 'Probe3',
        });
      });

      it('announces the default names for a cook that never named a profile', async () => {
        anAbandonedCook();
        await build();

        await service.autoStop(LAST_READING, NOTICE);

        expect(broadcast.broadcastSmokeUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ chamberName: 'Chamber' }),
        );
      });

      // Whichever trigger flipped the flag is the one that announces it; the
      // other flipped nothing and has nothing to say.
      it('announces once when two triggers stop the same cook', async () => {
        anAbandonedCook();
        await build();

        await Promise.all([
          service.autoStop(LAST_READING, NOTICE),
          service.autoStop(LAST_READING, NOTICE),
        ]);

        expect(broadcast.broadcastSmokeUpdate).toHaveBeenCalledTimes(1);
      });

      // The half-stopped cook — stamped, flag left on — is switched off here,
      // and that flip is exactly the one a stale client would toggle back.
      it('announces the flip that finishes off a cook already stamped', async () => {
        anAbandonedCook();
        smokes[0].finishedAt = new Date('2026-08-01T15:00:00.000Z');
        await build();

        const stopped = await service.autoStop(LAST_READING, NOTICE);

        expect(stopped.won).toBe(false);
        expect(states[0].smoking).toBe(false);
        expect(broadcast.broadcastSmokeUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ smoking: false }),
        );
      });

      it('says nothing when there was no cook to stop', async () => {
        await build();

        const stopped = await service.autoStop(LAST_READING, NOTICE);

        expect(stopped).toEqual({
          won: false,
          cook: { idle: true, smoking: false },
        });
        expect(broadcast.broadcastSmokeUpdate).not.toHaveBeenCalled();
      });

      // A socket that cannot be reached is a client that will read the truth on
      // its next load. The stop itself is already written and must stand.
      it('stops the cook even when the announcement fails', async () => {
        const logged = jest.spyOn(Logger, 'warn').mockImplementation();
        anAbandonedCook();
        await build();
        broadcast.broadcastSmokeUpdate.mockImplementation(() => {
          throw new Error('no socket server yet');
        });

        const stopped = await service.autoStop(LAST_READING, NOTICE);

        expect(stopped.won).toBe(true);
        expect(smokes[0].finishedAt).toEqual(LAST_READING);
        expect(states[0].smoking).toBe(false);
        expect(logged).toHaveBeenCalledWith(
          expect.stringContaining('cook-1'),
          'ActiveCook',
        );
      });
    });

    /**
     * The pitmaster is not at the box — that is the whole reason the cook went
     * stale. The socket only reaches an app that is already open, so the push
     * is the only thing that reaches somebody who walked away days ago and
     * never pressed End Smoke.
     */
    describe('telling the pitmaster their cook was stopped', () => {
      it('pushes once, with the sentence the stop was explained by', async () => {
        anAbandonedCook();
        await build();

        await service.autoStop(LAST_READING, NOTICE);

        expect(push.notify).toHaveBeenCalledTimes(1);
        expect(push.notify).toHaveBeenCalledWith('Smoker', NOTICE);
      });

      it('pushes once when two triggers stop the same cook', async () => {
        anAbandonedCook();
        await build();

        const stops = await Promise.all([
          service.autoStop(LAST_READING, NOTICE),
          service.autoStop(LAST_READING, NOTICE),
        ]);

        expect(stops.filter((stop) => stop.won)).toHaveLength(1);
        expect(push.notify).toHaveBeenCalledTimes(1);
      });

      /**
       * A cook already stamped was stopped once, and pushed for when it was
       * stamped; this call is only finishing the flip off. Pushing again would
       * tell the pitmaster twice about one cook.
       */
      it('says nothing when finishing off a cook that was already stamped', async () => {
        anAbandonedCook();
        smokes[0].finishedAt = new Date('2026-08-01T15:00:00.000Z');
        await build();

        await service.autoStop(LAST_READING, NOTICE);

        expect(push.notify).not.toHaveBeenCalled();
      });

      /**
       * The push is a courtesy on top of a write that has already happened. A
       * phone that cannot be reached — no VAPID keys, no subscriptions, the
       * push service down — must not undo the stop or fail the read that
       * noticed it.
       */
      it('leaves the stop committed when the push cannot be delivered', async () => {
        jest.spyOn(Logger, 'warn').mockImplementation();
        anAbandonedCook();
        await build();
        push.notify.mockRejectedValue(new Error('push down'));

        const stopped = await service.autoStop(LAST_READING, NOTICE);

        expect(stopped.won).toBe(true);
        expect(smokes[0].finishedAt).toEqual(LAST_READING);
        expect(states[0].smoking).toBe(false);
      });

      it('leaves the stop committed when the push throws on the way out', async () => {
        jest.spyOn(Logger, 'warn').mockImplementation();
        anAbandonedCook();
        await build();
        push.notify.mockImplementation(() => {
          throw new Error('no dispatcher');
        });

        const stopped = await service.autoStop(LAST_READING, NOTICE);

        expect(stopped.won).toBe(true);
        expect(states[0].smoking).toBe(false);
      });

      /**
       * A push endpoint that accepts the connection and then says nothing is
       * the failure a try/catch cannot see: nothing rejects, it simply never
       * answers. The read that noticed the abandoned cook — a client polling
       * the current timeline — would hang behind it until TCP gave up, so the
       * notice must not be on the caller's critical path at all.
       */
      it('stops the cook without waiting for a push that never answers', async () => {
        anAbandonedCook();
        await build();
        push.notify.mockReturnValue(new Promise(() => undefined));

        const stopped = await service.autoStop(LAST_READING, NOTICE);

        expect(stopped.won).toBe(true);
        expect(states[0].smoking).toBe(false);
        expect(smokes[0].finishedAt).toEqual(LAST_READING);
        expect(push.notify).toHaveBeenCalledTimes(1);
      }, 2000);

      /**
       * Left to itself, a send to an endpoint that never answers would sit in
       * memory until TCP gave up and, more to the point, would fail silently.
       * The deadline turns "never answered" into the same reported failure as a
       * refusal, and its rejection is handled where every other push failure is
       * — an unhandled one would take the process down long after the request
       * that triggered it was served.
       */
      it('gives up on a push that never answers and reports it', async () => {
        jest.useFakeTimers({
          doNotFake: ['performance', 'setImmediate'],
        } as never);
        const unhandled: unknown[] = [];
        const record = (reason: unknown): number => unhandled.push(reason);
        process.on('unhandledRejection', record);
        const logged = jest.spyOn(Logger, 'warn').mockImplementation();
        try {
          anAbandonedCook();
          await build();
          push.notify.mockReturnValue(new Promise(() => undefined));

          await service.autoStop(LAST_READING, NOTICE);
          jest.advanceTimersByTime(60_000);
          await new Promise(setImmediate);

          expect(logged).toHaveBeenCalledWith(
            expect.stringContaining('no push could be delivered'),
            'ActiveCook',
          );
          expect(unhandled).toEqual([]);
        } finally {
          process.off('unhandledRejection', record);
          jest.useRealTimers();
        }
      });
    });

    /**
     * The read that noticed — a poll of a running cook's timeline — has nothing
     * to do with the Stats screen, and must not fail because its numbers could
     * not be rebuilt. The stop itself has already been written.
     */
    it('leaves the stop committed when the archive cannot be recounted', async () => {
      jest.spyOn(Logger, 'warn').mockImplementation();
      anAbandonedCook();
      stats.recompute.mockRejectedValue(new Error('stats are down'));
      await build();

      const stopped = await service.autoStop(LAST_READING, NOTICE);

      expect(stopped.won).toBe(true);
      expect(smokes[0].finishedAt).toEqual(LAST_READING);
      expect(states[0].smoking).toBe(false);
    });

    /**
     * The pitmaster pressing End Smoke at the moment a trigger notices the
     * cook has been silent for hours. Whichever of the two writes the finish
     * stamp is the one that wrote it, and the pitmaster only hears from the box
     * about a stop the box actually made.
     */
    describe('racing the pitmaster’s own End Smoke', () => {
      it('is one stamp, and a push only for an auto-stop that won', async () => {
        anAbandonedCook();
        await build();

        const [stopped, finished] = await Promise.all([
          service.autoStop(LAST_READING, NOTICE),
          service.finish(),
        ]);

        // Who won is the store's to say rather than the verdict's: only the
        // auto-stop stamps the last reading, so the stamp names the winner and
        // the verdict is checked against it.
        expect(smokes[0].finishedAt).toBeInstanceOf(Date);
        const autoStopStamped =
          (smokes[0].finishedAt as Date).getTime() === LAST_READING.getTime();
        expect(stopped.won).toBe(autoStopStamped);
        expect(push.notify).toHaveBeenCalledTimes(autoStopStamped ? 1 : 0);
        // The finish is the only call that completes a cook, whichever of the
        // two stamped it — the auto-stop deliberately leaves it in progress.
        expect(finished.won).toBe(true);
        expect(smokes[0].status).toBe(SmokeStatus.Complete);
      });

      /**
       * The late manual finish: the pitmaster gets to the app days after the
       * box stopped their cook. What they end was already over, so the recorded
       * moment stays the honest one, and no second push goes out.
       */
      it('keeps the auto-stop’s stamp when the finish comes afterwards', async () => {
        anAbandonedCook();
        await build();

        await service.autoStop(LAST_READING, NOTICE);
        await service.finish();

        expect(smokes[0].finishedAt).toEqual(LAST_READING);
        expect(smokes[0].status).toBe(SmokeStatus.Complete);
        expect(push.notify).toHaveBeenCalledTimes(1);
      });

      /**
       * The other order: the cook was ended through the wizard and a trigger
       * comes along afterwards. There is nothing left to stamp, so there is
       * nothing to tell anybody about.
       */
      it('stamps nothing and says nothing once the cook has been finished', async () => {
        anAbandonedCook();
        await build();
        await service.finish();
        const finishedAt = smokes[0].finishedAt;

        const stopped = await service.autoStop(LAST_READING, NOTICE);

        expect(stopped.won).toBe(false);
        expect(smokes[0].finishedAt).toBe(finishedAt);
        expect(push.notify).not.toHaveBeenCalled();
      });
    });
  });

  describe('clearing the Active Cook', () => {
    /** The cook log of the Active Cook, as the pitmaster stamped it. */
    const aCookLog = (): void => {
      cookEvents.push(
        { _id: 'event-1', smokeId: 'cook-1', name: 'Wrapped' },
        { _id: 'event-2', smokeId: 'cook-1', name: 'Spritzed' },
      );
    };

    /** An Active Cook the pitmaster is throwing away: never finished. */
    const anUnfinishedCook = (): void => {
      smokes.push({
        _id: 'cook-1',
        status: SmokeStatus.InProgress,
        tempsId: 'temps-1',
      });
      states.push({ _id: 'state-1', smokeId: 'cook-1', smoking: true });
      aCookLog();
    };

    it('throws the cook log away and detaches the cook', async () => {
      anUnfinishedCook();
      await build();

      const cleared = await service.clear();

      expect(cleared.won).toBe(true);
      expect(cleared.cook).toEqual({ idle: true, smoking: false });
      expect(cookEvents).toEqual([]);
      expect(states[0]).toEqual(
        expect.objectContaining({ smokeId: '', smoking: false }),
      );
    });

    /**
     * Clearing is how a *finished* cook is put away too: the wizard finishes
     * the cook and then clears it, with the state still naming the
     * cook it has just completed. A discard that did not tell the two apart
     * would delete the log of every cook on the happy path, moments after it
     * was recorded.
     */
    it('keeps the log of a cook that was finished, and still detaches it', async () => {
      smokes.push({ _id: 'cook-1', status: SmokeStatus.Complete });
      states.push({ _id: 'state-1', smokeId: 'cook-1', smoking: false });
      aCookLog();
      await build();

      const cleared = await service.clear();

      expect(cleared.won).toBe(true);
      expect(cookEvents).toHaveLength(2);
      expect(states[0].smokeId).toBe('');
    });

    /**
     * The screens do not unmount when the Active Cook is cleared — the
     * stale-cook recovery clears from under a mounted smoke step — so a clear
     * that announced nothing would leave the previous cook's entries on
     * screen, and a Remove tapped there would delete an event of a cook put
     * away.
     */
    it('announces the now-empty cook log to every open screen', async () => {
      anUnfinishedCook();
      await build();

      await service.clear();

      expect(broadcast.broadcastCookEvents).toHaveBeenCalledWith([]);
    });

    /**
     * The finished cook's log is kept, but the smoker no longer names it, so
     * what every live screen is showing — the log of the Active Cook — is
     * empty here too.
     */
    it('announces an empty log when a finished cook is put away', async () => {
      smokes.push({ _id: 'cook-1', status: SmokeStatus.Complete });
      states.push({ _id: 'state-1', smokeId: 'cook-1', smoking: false });
      await build();

      await service.clear();

      expect(broadcast.broadcastCookEvents).toHaveBeenCalledWith([]);
    });

    it('announces once when two clears race', async () => {
      anUnfinishedCook();
      await build();

      const clears = await Promise.all([service.clear(), service.clear()]);

      expect(clears.filter((cleared) => cleared.won)).toHaveLength(1);
      expect(broadcast.broadcastCookEvents).toHaveBeenCalledTimes(1);
    });

    it('is lost, and says nothing, on a smoker with nothing attached', async () => {
      states.push({ _id: 'state-1', smokeId: '', smoking: false });
      aCookLog();
      await build();

      const cleared = await service.clear();

      expect(cleared.won).toBe(false);
      expect(cleared.cook).toEqual({ idle: true, smoking: false });
      expect(cookEvents).toHaveLength(2);
      expect(broadcast.broadcastCookEvents).not.toHaveBeenCalled();
    });

    /**
     * A state left naming a cook the archive no longer holds reads as idle
     * everywhere, which is how a smoker gets stuck. The clear detaches it all
     * the same — the slot is what it writes — and the orphaned log goes with
     * it, since nothing archived can lose by its removal.
     */
    it('detaches a cook the archive no longer holds, and throws its log out', async () => {
      jest.spyOn(Logger, 'warn').mockImplementation();
      states.push({ _id: 'state-1', smokeId: 'cook-1', smoking: true });
      aCookLog();
      await build();

      const cleared = await service.clear();

      expect(cleared.won).toBe(true);
      expect(states[0].smokeId).toBe('');
      expect(cookEvents).toEqual([]);
    });

    it('answers with the stored state, which is what the clear route serves', async () => {
      anUnfinishedCook();
      await build();

      const cleared = await service.clear();

      expect(cleared.state).toEqual(
        expect.objectContaining({ smokeId: '', smoking: false }),
      );
    });

    /**
     * The clear route answers with whatever the state collection holds, and on
     * a box whose state document was never written that is nothing. Served
     * rather than seeded, because reading the Active Cook no longer writes one
     * into being.
     */
    it('answers with no state at all on a box that has never held one', async () => {
      await build();

      const cleared = await service.clear();

      expect(cleared.won).toBe(false);
      expect(cleared.state).toBeNull();
      expect(states).toEqual([]);
    });

    // A socket that cannot be reached must not fail the clear itself.
    it('still clears the Active Cook when the announcement throws', async () => {
      jest.spyOn(Logger, 'error').mockImplementation();
      anUnfinishedCook();
      await build();
      broadcast.broadcastCookEvents.mockImplementation(() => {
        throw new Error('no server');
      });

      const cleared = await service.clear();

      expect(cleared.won).toBe(true);
      expect(states[0].smokeId).toBe('');
    });

    it('still clears the Active Cook when the cook log could not be removed', async () => {
      const logged = jest.spyOn(Logger, 'error').mockImplementation();
      anUnfinishedCook();
      await build();
      cookEventModel.deleteMany = () => ({
        exec: async () => {
          throw new Error('mongo hiccup');
        },
      });

      const cleared = await service.clear();

      expect(cleared.won).toBe(true);
      expect(states[0].smokeId).toBe('');
      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining('cook-1'),
        'ActiveCook',
      );
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
