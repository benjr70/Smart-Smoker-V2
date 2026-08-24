import { Logger } from '@nestjs/common';
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
 * to a fixed number of queries rather than one per cook — and how often it was
 * told anything, so the same can be asked of what a rebuild writes back.
 */
const countingModel = (docs: FakeDoc[]) => {
  const model = fakeModel(docs);
  const counter = { reads: 0, writes: 0 };
  const count = (methods: readonly string[], of: 'reads' | 'writes'): void => {
    methods.forEach((method) => {
      const original = (
        (model as unknown as Record<string, unknown>)[method] as (
          ...args: unknown[]
        ) => unknown
      ).bind(model);
      (model as unknown as Record<string, unknown>)[method] = (
        ...args: unknown[]
      ) => {
        counter[of] += 1;
        return original(...args);
      };
    });
  };
  count(['find', 'findOne', 'findById', 'aggregate'], 'reads');
  count(['updateOne', 'bulkWrite'], 'writes');
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
  /** What the installation has stored, which the window backfill cuts by. */
  let settings: FakeDoc[];
  let tempReads: { reads: number };
  /** What the rebuild wrote back onto the archive, and in how many trips. */
  let archiveWrites: { writes: number };
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
    archiveWrites = countedSmokes.counter;
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
          useValue: fakeModel(settings),
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
    settings = [];
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
    // Hourly, as a cook that never went silent long enough to have been over:
    // a series with hours of nothing in it is a cook that stopped, and is cut
    // there by the window backfill.
    for (let hour = 7; hour <= 17; hour += 1) {
      temps.push({
        tempsId: 'temps-legacy',
        date: new Date(
          `2025-11-02T${String(hour).padStart(2, '0')}:00:00.000Z`,
        ),
        ChamberTemp: hour === 17 ? '250' : '210',
      });
    }

    const stats = await (await build()).getStats();

    expect(stats.totalSessions).toBe(1);
    expect(stats.totalCookMs).toBe(10 * HOUR);
    expect(stats.records.longestCook).toMatchObject({
      smokeId: 'legacy',
      label: 'Pork butt · Nov 2, 2025',
    });
  });

  it('heals each cook with a bounded read of its own, and re-reads none of them after', async () => {
    // Every one of them unstamped, so each is healed on this first rebuild.
    for (let index = 0; index < 10; index += 1) {
      smokes.push({
        _id: `legacy-${index}`,
        preSmokeId: `pre-${index}`,
        tempsId: `temps-${index}`,
        date: new Date('2025-11-02T12:00:00.000Z'),
        status: SmokeStatus.Complete,
      });
      preSmokes.push({ _id: `pre-${index}`, meatType: 'Pork butt' });
      for (let hour = 7; hour <= 17; hour += 1) {
        temps.push({
          tempsId: `temps-${index}`,
          date: new Date(
            `2025-11-02T${String(hour).padStart(2, '0')}:00:00.000Z`,
          ),
          ChamberTemp: '210',
        });
      }
    }
    const service = await build();

    const stats = await service.recalculate();

    expect(stats.totalSessions).toBe(10);
    expect(stats.totalCookMs).toBe(100 * HOUR);
    // Two reads per cook healed and no more: its own rows walked for the
    // silence that ended it, and its peak asked of the window that came out.
    // Bounded per series deliberately — every unstamped cook of the archive
    // asked for at once would hold `cooks × rows` in memory at a stroke.
    expect(tempReads.reads).toBe(20);

    tempReads.reads = 0;
    await service.recalculate();

    // And never again: the stamps the healing wrote are what the durations and
    // the peaks are read from afterwards, however often the archive is rebuilt.
    expect(tempReads.reads).toBe(0);
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

  describe('the hottest chamber a cook ever ran', () => {
    /** One finished, fully stamped cook whose series ran `chamber`. */
    const stampedCook = (id: string, chamber: string[]): void => {
      smokes.push({
        _id: id,
        preSmokeId: `pre-${id}`,
        tempsId: `temps-${id}`,
        date: new Date('2026-04-20T12:00:00.000Z'),
        startedAt: new Date('2026-04-20T06:00:00.000Z'),
        finishedAt: new Date('2026-04-20T14:00:00.000Z'),
        status: SmokeStatus.Complete,
      });
      preSmokes.push({ _id: `pre-${id}`, name: id, meatType: 'Brisket' });
      chamber.forEach((value, index) =>
        temps.push({
          tempsId: `temps-${id}`,
          date: new Date(2026, 3, 20, 6 + index),
          ChamberTemp: value,
        }),
      );
    };

    it('backfills the peak of a cook finished before peaks were stamped', async () => {
      // Lexically the larger of the two, numerically the cooler.
      stampedCook('legacy', ['99', '245']);

      const stats = await (await build()).recalculate();

      expect(smokes[0].peakChamber).toBe(245);
      expect(stats.records.hottestChamber).toMatchObject({
        smokeId: 'legacy',
        value: 245,
      });
    });

    it('never reads a cook’s readings for its peak twice', async () => {
      stampedCook('legacy', ['210', '245']);
      const service = await build();
      await service.recalculate();

      tempReads.reads = 0;
      const stats = await service.recalculate();

      expect(tempReads.reads).toBe(0);
      expect(stats.records.hottestChamber).toMatchObject({ value: 245 });
    });

    it('never re-reads the readings of a cook whose series held nothing readable', async () => {
      // A series that was recorded, but of which nothing converts to a
      // temperature: there is no peak to stamp, and without a record that it
      // was asked this cook's readings would be re-scanned by every rebuild.
      stampedCook('unreadable', ['', 'n/a']);
      const service = await build();
      await service.recalculate();

      tempReads.reads = 0;
      const stats = await service.recalculate();

      expect(tempReads.reads).toBe(0);
      expect(stats.records.hottestChamber).toBeNull();
    });

    it('backfills a whole archive of legacy cooks in one round trip', async () => {
      for (let index = 0; index < 5; index += 1) {
        stampedCook(`legacy-${index}`, ['210', `24${index}`]);
      }

      await (await build()).recalculate();

      // A write per cook would be as many concurrent trips as the archive is
      // long, fired from inside a GET /stats.
      expect(archiveWrites.writes).toBe(1);
      expect(smokes.map((smoke) => smoke.peakChamber)).toEqual([
        240, 241, 242, 243, 244,
      ]);
    });

    it('uses the peak it just computed for a cook whose stored one is not a number', async () => {
      stampedCook('nonsense', ['245']);
      // What a peak stamped from a reading nothing could be made of looks like
      // in storage: present, and no temperature.
      smokes[0].peakChamber = Number.NaN;

      const stats = await (await build()).recalculate();

      expect(stats.records.hottestChamber).toMatchObject({
        smokeId: 'nonsense',
        value: 245,
      });
    });

    it('reports the hottest of the cooks that carry a peak', async () => {
      stampedCook('cooler', ['180']);
      stampedCook('hotter', ['310']);

      const stats = await (await build()).recalculate();

      expect(stats.records.hottestChamber).toMatchObject({
        smokeId: 'hotter',
        value: 310,
      });
    });

    it('holds no record while no cook recorded a chamber at all', async () => {
      stampedCook('unrecorded', []);

      const stats = await (await build()).recalculate();

      expect(stats.totalSessions).toBe(1);
      expect(stats.records.hottestChamber).toBeNull();
    });
  });

  describe('the cook window of a cook nobody ended', () => {
    const OPENED = Date.parse('2026-04-20T06:00:00.000Z');

    /** A reading of `chamber`, `hours` after the fixture's opening moment. */
    const reading = (id: string, hours: number, chamber: string): FakeDoc => ({
      tempsId: `temps-${id}`,
      date: new Date(OPENED + hours * HOUR),
      ChamberTemp: chamber,
    });

    /**
     * A finished cook recorded before the stamps existed, whose series holds a
     * real ten-hour cook and then a stray firing of the box a fortnight later —
     * the shape the production archive's broken cooks are in.
     */
    const pollutedCook = (id: string, strayChamber = '400'): void => {
      smokes.push({
        _id: id,
        preSmokeId: `pre-${id}`,
        tempsId: `temps-${id}`,
        date: new Date(OPENED),
        status: SmokeStatus.Complete,
      });
      preSmokes.push({ _id: `pre-${id}`, name: id, meatType: 'Brisket' });
      for (let hour = 0; hour <= 10; hour += 1) {
        temps.push(reading(id, hour, '225'));
      }
      temps.push(
        reading(id, 14 * 24, strayChamber),
        reading(id, 14 * 24 + 1, strayChamber),
      );
    };

    it('stamps a legacy cook with the window its readings ran in', async () => {
      pollutedCook('polluted');

      const stats = await (await build()).recalculate();

      expect(smokes[0]).toMatchObject({
        startedAt: new Date(OPENED),
        finishedAt: new Date(OPENED + 10 * HOUR),
      });
      expect(stats.totalCookMs).toBe(10 * HOUR);
    });

    it('replaces a peak that was scanned over the stray firing after the cook', async () => {
      pollutedCook('polluted');
      // What an earlier rebuild left behind: the hottest reading anywhere in
      // the series, which is the grill run, not the smoke.
      smokes[0].peakChamber = 400;
      smokes[0].peakChamberScanned = true;

      const stats = await (await build()).recalculate();

      expect(smokes[0].peakChamber).toBe(225);
      expect(stats.records.hottestChamber).toMatchObject({
        smokeId: 'polluted',
        value: 225,
      });
    });

    it('marks a derived finish as derived, and says what the cut set aside', async () => {
      pollutedCook('polluted');
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await (await build()).recalculate();

      // A cut this pass makes is almost always pollution — but a cook whose
      // readings genuinely stopped for hours (the backend down, the box off
      // wifi overnight) is cut the same way. The mark is what tells a derived
      // finish from one somebody recorded, and no reading is deleted, so a cut
      // can be read back and reversed.
      expect(smokes[0].cookWindowBackfilled).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          new Date(OPENED + (14 * 24 + 1) * HOUR).toISOString(),
        ),
      );
      warn.mockRestore();
    });

    it('leaves a cook the user ended alone, marks and all', async () => {
      completedCook('honest', 'Pork butt', 9);
      smokes[0].finishedAt = new Date(smokes[0].startedAt.getTime() + 5 * HOUR);

      await (await build()).recalculate();

      expect(smokes[0].cookWindowBackfilled).toBeUndefined();
    });

    /**
     * A stored threshold of nonsense — a hand edit, a restored backup, a direct
     * write, none of which pass through the API's validation — would otherwise
     * make every silence a gap and stamp each legacy cook as having run for no
     * time at all, permanently.
     */
    it('cuts by the shipped default where the stored threshold is nonsense', async () => {
      settings.push({ autoStop: { idleHours: 0 } });
      pollutedCook('polluted');

      const stats = await (await build()).recalculate();

      expect(stats.totalCookMs).toBe(10 * HOUR);
      expect(smokes[0].finishedAt).toEqual(new Date(OPENED + 10 * HOUR));
    });

    it('changes nothing on a second rebuild, and keeps every reading', async () => {
      pollutedCook('polluted');
      const service = await build();
      await service.recalculate();
      const afterFirst = JSON.parse(JSON.stringify(smokes));
      tempReads.reads = 0;

      const stats = await service.recalculate();

      expect(JSON.parse(JSON.stringify(smokes))).toEqual(afterFirst);
      // A stamped cook is answered from its stamps: nothing goes back to the
      // readings for it, which is what makes the repair a one-off per cook.
      expect(tempReads.reads).toBe(0);
      expect(temps).toHaveLength(13);
      expect(stats.totalCookMs).toBe(10 * HOUR);
    });

    it('no longer calls a fortnight of pollution the longest cook on record', async () => {
      pollutedCook('polluted');
      // A cook that really did run longer than the repaired one.
      completedCook('honest', 'Pork butt', 9);
      smokes[1].finishedAt = new Date(
        smokes[1].startedAt.getTime() + 12 * HOUR,
      );

      const stats = await (await build()).getStats();

      expect(stats.records.longestCook).toMatchObject({
        smokeId: 'honest',
        value: 12 * HOUR,
      });
      expect(stats.totalCookMs).toBe(22 * HOUR);
    });

    it('takes off a peak the window cannot account for, and keeps it off', async () => {
      // The cook itself recorded nothing readable — a chamber probe that was
      // never plugged in — while the stray firing after it did, and an earlier
      // unbounded scan stamped that as the cook's peak.
      smokes.push({
        _id: 'unreadable',
        preSmokeId: 'pre-unreadable',
        tempsId: 'temps-unreadable',
        date: new Date(OPENED),
        status: SmokeStatus.Complete,
        peakChamber: 400,
        peakChamberScanned: true,
      });
      preSmokes.push({ _id: 'pre-unreadable', meatType: 'Brisket' });
      for (let hour = 0; hour <= 10; hour += 1) {
        temps.push(reading('unreadable', hour, ''));
      }
      temps.push(reading('unreadable', 14 * 24, '400'));
      const service = await build();

      const first = await service.recalculate();
      const stored = { ...smokes[0] };
      const second = await service.recalculate();

      expect(first.records.hottestChamber).toBeNull();
      // The same on the next rebuild, and on the document in between: a value
      // the window cannot account for is gone rather than merely unreported.
      expect(second.records.hottestChamber).toBeNull();
      expect(stored.peakChamber).toBeUndefined();
      expect(smokes[0].peakChamber).toBeUndefined();
      expect(smokes[0].peakChamberScanned).toBe(true);
    });

    it('leaves a cook whose readings carry no moments as it found it', async () => {
      smokes.push({
        _id: 'undated',
        preSmokeId: 'pre-undated',
        tempsId: 'temps-undated',
        date: new Date(OPENED),
        status: SmokeStatus.Complete,
      });
      preSmokes.push({ _id: 'pre-undated', meatType: 'Brisket' });
      // Rows an old import wrote without a date: there is no window to cut out
      // of them, and nothing about when the cook ran to record.
      temps.push({ tempsId: 'temps-undated', ChamberTemp: '245' });

      const stats = await (await build()).recalculate();

      expect(smokes[0].startedAt).toBeUndefined();
      expect(smokes[0].finishedAt).toBeUndefined();
      // Its peak is still found, by the unbounded scan that has always read
      // rows like these.
      expect(stats.records.hottestChamber).toMatchObject({ value: 245 });
    });

    it('leaves the cook on the smoker alone', async () => {
      pollutedCook('running');
      smokes[0].status = SmokeStatus.InProgress;

      await (await build()).recalculate();

      expect(smokes[0].startedAt).toBeUndefined();
      expect(smokes[0].finishedAt).toBeUndefined();
    });
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
