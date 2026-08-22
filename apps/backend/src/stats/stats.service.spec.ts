import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationSettings } from '../appSettings/app-settings.schema';
import { PreSmoke } from '../presmoke/presmoke.schema';
import { SmokeStatus } from '../smoke/smoke.schema';
import { FakeDoc, fakeModel } from '../timeline/testing/fake-model';
import { TimelineService } from '../timeline/timeline.service';
import { StatsSnapshot } from './stats.schema';
import { StatsService } from './stats.service';

const HOUR = 60 * 60 * 1000;

/**
 * A model that remembers how often it was asked anything, so a read can be held
 * to a fixed number of queries rather than one per cook.
 */
const countingModel = (docs: FakeDoc[]) => {
  const model = fakeModel(docs);
  const counter = { reads: 0 };
  (['find', 'findOne', 'findById', 'aggregate'] as const).forEach((method) => {
    const original = model[method].bind(model) as (
      ...args: unknown[]
    ) => unknown;
    (model as unknown as Record<string, unknown>)[method] = (
      ...args: unknown[]
    ) => {
      counter.reads += 1;
      return original(...args);
    };
  });
  return { model, counter };
};

describe('StatsService', () => {
  let smokes: FakeDoc[];
  let preSmokes: FakeDoc[];
  let profiles: FakeDoc[];
  let postSmokes: FakeDoc[];
  let ratings: FakeDoc[];
  let temps: FakeDoc[];
  let snapshots: FakeDoc[];
  let tempReads: { reads: number };
  /**
   * How many times the archive itself was read. A rebuild reads it; a served
   * cache only counts it, which is a different query — so this is what tells
   * a cached read apart from a recomputed one.
   */
  let archiveReads: { reads: number };
  /** The archive's model, so a test can stage a write inside a read of it. */
  let smokeModel: ReturnType<typeof countingModel>['model'];

  const build = async (): Promise<StatsService> => {
    const counted = countingModel(temps);
    tempReads = counted.counter;
    const countedSmokes = countingModel(smokes);
    archiveReads = countedSmokes.counter;
    smokeModel = countedSmokes.model;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatsService,
        // The real timeline service, on the same fake collections: how long a
        // cook ran is its answer, and stats must be tested against the answer
        // it actually gives — stamps where there are stamps, readings where
        // there are not.
        TimelineService,
        { provide: getModelToken('Smoke'), useValue: countedSmokes.model },
        { provide: getModelToken('Temp'), useValue: counted.model },
        {
          provide: getModelToken(StatsSnapshot.name),
          useValue: fakeModel(snapshots),
        },
        { provide: getModelToken('state'), useValue: fakeModel([]) },
        {
          provide: getModelToken(ApplicationSettings.name),
          useValue: fakeModel([]),
        },
        {
          provide: getModelToken(PreSmoke.name),
          useValue: fakeModel(preSmokes),
        },
        {
          provide: getModelToken('SmokeProfile'),
          useValue: fakeModel(profiles),
        },
        {
          provide: getModelToken('PostSmoke'),
          useValue: fakeModel(postSmokes),
        },
        { provide: getModelToken('Ratings'), useValue: fakeModel(ratings) },
      ],
    }).compile();
    return module.get<StatsService>(StatsService);
  };

  beforeEach(() => {
    smokes = [];
    preSmokes = [];
    profiles = [];
    postSmokes = [];
    ratings = [];
    temps = [];
    snapshots = [];
  });

  /** One finished cook of `meat`, weighing `pounds`, scored `score`. */
  const completedCook = (id: string, meat: string, pounds: number): void => {
    smokes.push({
      _id: id,
      preSmokeId: `pre-${id}`,
      date: new Date('2026-04-20T12:00:00.000Z'),
      startedAt: new Date('2026-04-20T06:00:00.000Z'),
      finishedAt: new Date('2026-04-20T14:00:00.000Z'),
      status: SmokeStatus.Complete,
    });
    preSmokes.push({
      _id: `pre-${id}`,
      meatType: meat,
      weight: { weight: pounds, unit: 'LB' },
    });
  };

  it('derives the archive from every completed cook and its five documents', async () => {
    smokes.push({
      _id: 'smoke-1',
      preSmokeId: 'pre-1',
      smokeProfileId: 'profile-1',
      postSmokeId: 'post-1',
      ratingId: 'rating-1',
      tempsId: 'temps-1',
      date: new Date('2026-04-20T12:00:00.000Z'),
      startedAt: new Date('2026-04-20T06:00:00.000Z'),
      finishedAt: new Date('2026-04-20T14:00:00.000Z'),
      status: SmokeStatus.Complete,
    });
    preSmokes.push({
      _id: 'pre-1',
      name: 'Sunday brisket',
      meatType: 'Brisket',
      weight: { weight: 12, unit: 'LB' },
    });
    profiles.push({ _id: 'profile-1', woodType: 'Hickory' });
    postSmokes.push({ _id: 'post-1', restTime: '01:30' });
    ratings.push({
      _id: 'rating-1',
      smokeFlavor: 8,
      seasoning: 7,
      tenderness: 9,
      overallTaste: 8,
    });

    const stats = await (await build()).getStats();

    expect(stats.totalSessions).toBe(1);
    expect(stats.totalCookMs).toBe(8 * HOUR);
    expect(stats.totalPounds).toBe(12);
    expect(stats.totalRestMs).toBe(90 * 60 * 1000);
    expect(stats.averageRating).toBe(8);
    expect(stats.byMeat).toEqual([
      { meatType: 'Brisket', sessions: 1, pounds: 12 },
    ]);
    expect(stats.byWood).toEqual([{ woodType: 'Hickory', sessions: 1 }]);
    expect(stats.records.highestRated).toMatchObject({
      smokeId: 'smoke-1',
      label: 'Sunday brisket',
      value: 8,
    });
    expect(stats.categoryAverages.tenderness).toBe(9);
  });

  it('counts a cook recorded before the timestamps existed, from its readings', async () => {
    smokes.push({
      _id: 'legacy',
      preSmokeId: 'pre-legacy',
      tempsId: 'temps-legacy',
      date: new Date('2025-11-02T12:00:00.000Z'),
      status: SmokeStatus.Complete,
    });
    preSmokes.push({
      _id: 'pre-legacy',
      meatType: 'Pork butt',
      weight: { weight: 8, unit: 'LB' },
    });
    temps.push(
      {
        tempsId: 'temps-legacy',
        date: new Date('2025-11-02T07:00:00.000Z'),
        ChamberTemp: '210',
      },
      {
        tempsId: 'temps-legacy',
        date: new Date('2025-11-02T17:00:00.000Z'),
        ChamberTemp: '250',
      },
    );

    const stats = await (await build()).getStats();

    expect(stats.totalSessions).toBe(1);
    expect(stats.totalCookMs).toBe(10 * HOUR);
    expect(stats.records.longestCook).toMatchObject({
      smokeId: 'legacy',
      label: 'Pork butt · Nov 2, 2025',
    });
  });

  it('costs the same number of reads whether the archive holds one cook or ten', async () => {
    // Every one of them unstamped, so each would otherwise be two more queries
    // hunting for the ends of its series.
    for (let index = 0; index < 10; index += 1) {
      smokes.push({
        _id: `legacy-${index}`,
        preSmokeId: `pre-${index}`,
        tempsId: `temps-${index}`,
        date: new Date('2025-11-02T12:00:00.000Z'),
        status: SmokeStatus.Complete,
      });
      preSmokes.push({ _id: `pre-${index}`, meatType: 'Pork butt' });
      temps.push(
        {
          tempsId: `temps-${index}`,
          date: new Date('2025-11-02T07:00:00.000Z'),
          ChamberTemp: '210',
        },
        {
          tempsId: `temps-${index}`,
          date: new Date('2025-11-02T17:00:00.000Z'),
          ChamberTemp: '250',
        },
      );
    }

    const stats = await (await build()).getStats();

    expect(stats.totalSessions).toBe(10);
    expect(stats.totalCookMs).toBe(100 * HOUR);
    expect(tempReads.reads).toBe(1);
  });

  it('says nothing about an installation that has never finished a cook', async () => {
    smokes.push({
      _id: 'running',
      preSmokeId: 'pre-1',
      status: SmokeStatus.InProgress,
    });
    preSmokes.push({
      _id: 'pre-1',
      meatType: 'Pork butt',
      weight: { weight: 9, unit: 'LB' },
    });

    const stats = await (await build()).getStats();

    expect(stats.totalSessions).toBe(0);
    expect(stats.totalPounds).toBeNull();
    expect(stats.byMeat).toEqual([]);
  });

  describe('the stored aggregate', () => {
    it('computes and stores the archive when nothing has been stored yet', async () => {
      completedCook('smoke-1', 'Brisket', 12);

      const stats = await (await build()).getStats();

      expect(stats.totalSessions).toBe(1);
      expect(snapshots).toEqual([
        expect.objectContaining({
          aggregate: stats,
          dirty: false,
          completedSmokes: 1,
        }),
      ]);
    });

    it('serves the stored aggregate again without reading the archive', async () => {
      completedCook('smoke-1', 'Brisket', 12);
      const service = await build();

      const first = await service.getStats();
      const readsAfterFirst = archiveReads.reads;
      const second = await service.getStats();

      expect(second).toEqual(first);
      expect(archiveReads.reads).toBe(readsAfterFirst);
    });

    it('rebuilds once for a dirty aggregate and stops being dirty', async () => {
      completedCook('smoke-1', 'Brisket', 12);
      const service = await build();
      await service.getStats();
      // What a rating write leaves behind: the numbers changed, nothing
      // recomputed them.
      ratings.push({ _id: 'rating-1', overallTaste: 9 });
      smokes[0].ratingId = 'rating-1';
      await service.markDirty();

      const rebuilt = await service.getStats();
      const readsAfterRebuild = archiveReads.reads;
      await service.getStats();

      expect(rebuilt.averageRating).toBe(9);
      expect(snapshots[0]).toMatchObject({ dirty: false });
      expect(archiveReads.reads).toBe(readsAfterRebuild);
    });

    it('rebuilds when the archive holds a different number of cooks than it was told', async () => {
      completedCook('smoke-1', 'Brisket', 12);
      const service = await build();
      await service.getStats();
      // Finished by something that never announced itself — a hand-edit, a
      // restored backup — so the flag is still clear and only the count knows.
      completedCook('smoke-2', 'Pork butt', 8);

      const healed = await service.getStats();

      expect(healed.totalSessions).toBe(2);
      expect(snapshots[0]).toMatchObject({ completedSmokes: 2 });
    });

    it('rebuilds to exactly what a first computation of the same archive gives', async () => {
      completedCook('smoke-1', 'Brisket', 12);
      completedCook('smoke-2', 'Pork butt', 8);
      postSmokes.push({ _id: 'post-1', restTime: '45m' });
      smokes[0].postSmokeId = 'post-1';
      ratings.push({ _id: 'rating-1', overallTaste: 7, tenderness: 6 });
      smokes[1].ratingId = 'rating-1';
      const service = await build();
      await service.getStats();
      await service.markDirty();

      const rebuilt = await service.getStats();
      // The same archive, read by an installation that has never computed it.
      snapshots = [];
      const fromScratch = await (await build()).getStats();

      expect(rebuilt).toEqual(fromScratch);
    });

    it('leaves the flag standing when something is marked stale mid-rebuild', async () => {
      completedCook('smoke-1', 'Brisket', 12);
      const service = await build();
      await service.getStats();
      await service.markDirty();
      // A rating written in the window between the rebuild reading the archive
      // and storing what it read. Clearing the flag on the way out would bury
      // that score forever: the cook count is unchanged, so nothing else would
      // ever notice the stored numbers had missed it.
      scoreTheCookDuringTheNextArchiveRead(service);

      await service.getStats();

      expect(snapshots[0]).toMatchObject({ dirty: true });
      const readsAfterRace = archiveReads.reads;
      expect((await service.getStats()).averageRating).toBe(9);
      expect(archiveReads.reads).toBeGreaterThan(readsAfterRace);
    });
  });

  /**
   * Score the one cook while the archive is being read for a rebuild — the race
   * a stats read cannot see happening, staged so it happens every time.
   */
  const scoreTheCookDuringTheNextArchiveRead = (
    service: StatsService,
  ): void => {
    type ArchiveRead = (filter?: FakeDoc) => { exec(): Promise<FakeDoc[]> };
    const model = smokeModel as unknown as Record<string, unknown>;
    const readArchive = (model.find as ArchiveRead).bind(smokeModel);
    let raced = false;
    model.find = (filter: FakeDoc = {}) => {
      const found = readArchive(filter);
      return {
        async exec() {
          const cooks = await found.exec();
          if (!raced) {
            raced = true;
            ratings.push({ _id: 'rating-1', overallTaste: 9 });
            smokes[0].ratingId = 'rating-1';
            await service.markDirty();
          }
          return cooks;
        },
      };
    };
  };
});
