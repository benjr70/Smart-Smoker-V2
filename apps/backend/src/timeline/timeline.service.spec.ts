import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { SmokeStatus } from '../smoke/smoke.schema';
import { ApplicationSettings } from '../appSettings/app-settings.schema';
import { PreSmoke } from '../presmoke/presmoke.schema';
import { TimelineService } from './timeline.service';
import { FakeDoc, fakeModel } from './testing/fake-model';

/** Let the wall clock move on, so a second stamp would be a different moment. */
const tick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 5));

const reading = (date: string, chamber: string, meat: string): FakeDoc => ({
  tempsId: 'temps-id',
  date: new Date(date),
  ChamberTemp: chamber,
  MeatTemp: meat,
  Meat2Temp: '0',
  Meat3Temp: '0',
});

describe('TimelineService', () => {
  let service: TimelineService;
  let smokes: FakeDoc[];
  let temps: FakeDoc[];
  let settings: FakeDoc[];
  let states: FakeDoc[];
  let preSmokes: FakeDoc[];

  /** The models the service was built on, so a test can watch what it reads. */
  let models: {
    temps: ReturnType<typeof fakeModel>;
    preSmokes: ReturnType<typeof fakeModel>;
  };

  const build = async (): Promise<TimelineService> => {
    models = { temps: fakeModel(temps), preSmokes: fakeModel(preSmokes) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimelineService,
        { provide: getModelToken('Smoke'), useValue: fakeModel(smokes) },
        { provide: getModelToken('Temp'), useValue: models.temps },
        {
          provide: getModelToken(ApplicationSettings.name),
          useValue: fakeModel(settings),
        },
        { provide: getModelToken('state'), useValue: fakeModel(states) },
        {
          provide: getModelToken(PreSmoke.name),
          useValue: models.preSmokes,
        },
      ],
    }).compile();
    return module.get<TimelineService>(TimelineService);
  };

  beforeEach(async () => {
    states = [];
    preSmokes = [];
    smokes = [
      {
        _id: 'smoke-id',
        tempsId: 'temps-id',
        status: SmokeStatus.Complete,
      },
    ];
    temps = [
      reading('2026-08-01T10:05:00.000Z', '210', '80'),
      reading('2026-08-01T13:00:00.000Z', '268', '150'),
      reading('2026-08-01T15:55:00.000Z', '244', '198'),
    ];
    settings = [];
    service = await build();
  });

  it('derives a stored cook timeline from the readings it recorded', async () => {
    const timeline = await service.getTimeline('smoke-id');

    expect(timeline.startedAt).toEqual(new Date('2026-08-01T10:05:00.000Z'));
    expect(timeline.finishedAt).toEqual(new Date('2026-08-01T15:55:00.000Z'));
    expect(timeline.peakChamber).toBe(268);
    expect(timeline.peakMeat).toBe(198);
  });

  it('derives nothing for a smoke that does not exist', async () => {
    expect(await service.getTimeline('no-such-smoke')).toEqual({
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      peakChamber: null,
      peakMeat: null,
      targetTemp: null,
    });
  });

  it('derives nothing from a cook that never recorded a series', async () => {
    smokes[0].tempsId = undefined;

    expect((await service.getTimeline('smoke-id')).peakChamber).toBeNull();
  });

  describe('getDurationMs', () => {
    it('answers a stamped cook from its stamps alone, without reading the series', async () => {
      const smoke = {
        tempsId: 'temps-id',
        status: SmokeStatus.Complete,
        startedAt: new Date('2026-08-01T10:00:00.000Z'),
        finishedAt: new Date('2026-08-01T16:00:00.000Z'),
      };

      expect(await service.getDurationMs(smoke)).toBe(6 * 60 * 60 * 1000);
    });

    it('falls back to the ends of the series for a cook recorded before the stamps', async () => {
      const smoke = { tempsId: 'temps-id', status: SmokeStatus.Complete };

      // 10:05 to 15:55 — the first and last readings of the seeded series.
      expect(await service.getDurationMs(smoke)).toBe(
        5 * 60 * 60 * 1000 + 50 * 60 * 1000,
      );
    });

    it('answers nothing for a cook still running', async () => {
      const smoke = { tempsId: 'temps-id', status: SmokeStatus.InProgress };

      expect(await service.getDurationMs(smoke)).toBeNull();
    });

    /**
     * A reading may be stored without a date — `TempDto.date` is optional — and
     * the cheap end-reads must skip it exactly as the full derivation does.
     * Otherwise the History card and the review screen would answer differently
     * about the same cook, and there is no version of that anybody can read.
     */
    it('skips a reading stored without a date, as the derived timeline does', async () => {
      temps.unshift({
        tempsId: 'temps-id',
        ChamberTemp: '200',
        MeatTemp: '70',
      });
      const smoke = { tempsId: 'temps-id', status: SmokeStatus.Complete };

      const duration = await service.getDurationMs(smoke);

      // 10:05 to 15:55 — the ends of the series that carry a moment.
      expect(duration).toBe(5 * 60 * 60 * 1000 + 50 * 60 * 1000);
      expect(duration).toBe((await service.getTimeline('smoke-id')).durationMs);
    });

    it('answers nothing for a cook whose readings all lack a date', async () => {
      temps = [{ tempsId: 'temps-id', ChamberTemp: '200', MeatTemp: '70' }];
      service = await build();

      expect(
        await service.getDurationMs({
          tempsId: 'temps-id',
          status: SmokeStatus.Complete,
        }),
      ).toBeNull();
    });

    it('answers nothing for a cook with neither stamps nor readings', async () => {
      expect(
        await service.getDurationMs({ status: SmokeStatus.Complete }),
      ).toBeNull();
    });
  });

  describe('getDurationsMs', () => {
    /** A second cook, with a series of its own to be found the ends of. */
    const seedSecondSeries = (): void => {
      temps.push(
        {
          tempsId: 'other-temps',
          date: new Date('2026-08-02T08:00:00.000Z'),
          ChamberTemp: '200',
        },
        {
          tempsId: 'other-temps',
          date: new Date('2026-08-02T11:00:00.000Z'),
          ChamberTemp: '240',
        },
      );
    };

    it('answers a whole archive the same as it answers one cook at a time', async () => {
      seedSecondSeries();
      service = await build();
      const archive = [
        {
          tempsId: 'temps-id',
          status: SmokeStatus.Complete,
          startedAt: new Date('2026-08-01T10:00:00.000Z'),
          finishedAt: new Date('2026-08-01T16:00:00.000Z'),
        },
        { tempsId: 'temps-id', status: SmokeStatus.Complete },
        { tempsId: 'other-temps', status: SmokeStatus.Complete },
        { tempsId: 'temps-id', status: SmokeStatus.InProgress },
        { status: SmokeStatus.Complete },
      ];

      expect(await service.getDurationsMs(archive)).toEqual(
        await Promise.all(archive.map((smoke) => service.getDurationMs(smoke))),
      );
    });

    it('reads the series once however many cooks are asked about', async () => {
      seedSecondSeries();
      service = await build();
      const reads = jest.spyOn(models.temps, 'aggregate');

      await service.getDurationsMs([
        { tempsId: 'temps-id', status: SmokeStatus.Complete },
        { tempsId: 'temps-id', status: SmokeStatus.Complete },
        { tempsId: 'other-temps', status: SmokeStatus.Complete },
      ]);

      expect(reads).toHaveBeenCalledTimes(1);
    });

    it('asks the store nothing about an archive whose cooks are all stamped', async () => {
      const reads = jest.spyOn(models.temps, 'aggregate');

      const durations = await service.getDurationsMs([
        {
          tempsId: 'temps-id',
          status: SmokeStatus.Complete,
          startedAt: new Date('2026-08-01T10:00:00.000Z'),
          finishedAt: new Date('2026-08-01T16:00:00.000Z'),
        },
      ]);

      expect(durations).toEqual([6 * 60 * 60 * 1000]);
      expect(reads).not.toHaveBeenCalled();
    });

    it('answers nothing for a cook whose readings all lack a date', async () => {
      temps = [{ tempsId: 'temps-id', ChamberTemp: '200' }];
      service = await build();

      expect(
        await service.getDurationsMs([
          { tempsId: 'temps-id', status: SmokeStatus.Complete },
        ]),
      ).toEqual([null]);
    });
  });

  describe('getCurrentTimeline', () => {
    const NOW = new Date('2026-08-17T18:00:00.000Z');

    /** A reading of the cook in progress, `minutesAgo` before the fixed now. */
    const running = (minutesAgo: number, meat: string): FakeDoc => ({
      tempsId: 'live-temps',
      date: new Date(NOW.getTime() - minutesAgo * 60_000),
      ChamberTemp: '250',
      MeatTemp: meat,
      Meat2Temp: '0',
      Meat3Temp: '0',
    });

    /** A cook in progress, being watched on probe 1 at 203°F. */
    const startTheCook = (): FakeDoc => {
      const live: FakeDoc = {
        _id: 'live-smoke',
        tempsId: 'live-temps',
        status: SmokeStatus.InProgress,
        startedAt: new Date(NOW.getTime() - 60 * 60_000),
      };
      smokes.push(live);
      states.push({ _id: 'state-id', smokeId: 'live-smoke', smoking: true });
      settings.push({
        _id: 'settings-id',
        probeTarget: {
          enabled: true,
          probes: [{ slot: 'probe1', enabled: true, target: 203 }],
        },
      });
      return live;
    };

    it('answers the running cook’s timeline with its projected finish', async () => {
      startTheCook();
      temps.push(running(60, '143'), running(30, '153'), running(0, '163'));
      service = await build();

      const timeline = await service.getCurrentTimeline(NOW);

      expect(timeline.startedAt).toEqual(new Date('2026-08-17T17:00:00.000Z'));
      expect(timeline.peakMeat).toBe(163);
      expect(timeline.estimate.state).toBe('ok');
      expect(timeline.estimate.targetTemp).toBe(203);
      expect(timeline.estimate.startTemp).toBe(143);
      expect(timeline.estimate.ratePerHour).toBeCloseTo(20, 5);
      // 40°F to go at 20°F/hr.
      expect(timeline.estimate.eta).toEqual(
        new Date('2026-08-17T20:00:00.000Z'),
      );
    });

    it('measures progress from the first reading after the cook started', async () => {
      startTheCook();
      temps.push(
        // Taken while the meat was still being trimmed, before Start Smoking.
        running(180, '40'),
        running(60, '143'),
        running(0, '163'),
      );
      service = await build();

      const { estimate } = await service.getCurrentTimeline(NOW);

      expect(estimate.startTemp).toBe(143);
      // 20°F of the 60°F between 143°F and the 203°F target.
      expect(estimate.progressPercent).toBeCloseTo(100 / 3, 5);
    });

    it('reads the probe the watch list names, not the first one wired in', async () => {
      startTheCook();
      settings[0].probeTarget.probes = [
        { slot: 'probe1', enabled: false, target: 203 },
        { slot: 'probe2', enabled: true, target: 165 },
      ];
      temps.push(
        { ...running(60, '143'), Meat2Temp: '105' },
        { ...running(30, '153'), Meat2Temp: '115' },
        { ...running(0, '163'), Meat2Temp: '125' },
      );
      service = await build();

      const { estimate } = await service.getCurrentTimeline(NOW);

      expect(estimate.targetTemp).toBe(165);
      expect(estimate.startTemp).toBe(105);
      expect(estimate.ratePerHour).toBeCloseTo(20, 5);
    });

    it('estimates nothing towards a target nobody set', async () => {
      startTheCook();
      settings[0].probeTarget.probes = [
        { slot: 'probe1', enabled: false, target: 203 },
      ];
      temps.push(running(60, '143'), running(0, '163'));
      service = await build();

      const { estimate, peakMeat } = await service.getCurrentTimeline(NOW);

      // The cook is still read — only the projection has nothing to say.
      expect(peakMeat).toBe(163);
      expect(estimate.state).toBeNull();
      expect(estimate.targetTemp).toBeNull();
      expect(estimate.eta).toBeNull();
    });

    it('answers an empty timeline and an empty estimate when nothing is cooking', async () => {
      service = await build();

      const timeline = await service.getCurrentTimeline(NOW);

      expect(timeline.startedAt).toBeNull();
      expect(timeline.estimate.state).toBeNull();
    });

    /**
     * A finished cook of `meatType` weighing `weight` lb that climbed from 40°F
     * to its 200°F target over `hours`.
     */
    const pastCook = (
      id: string,
      meatType: string,
      weight: number,
      hours: number,
    ) => {
      smokes.push({
        _id: id,
        preSmokeId: `pre-${id}`,
        tempsId: `temps-${id}`,
        status: SmokeStatus.Complete,
        startedAt: new Date(NOW.getTime() - (hours + 100) * 60 * 60_000),
        finishedAt: new Date(NOW.getTime() - 100 * 60 * 60_000),
        targetTemp: 200,
      });
      preSmokes.push({
        _id: `pre-${id}`,
        meatType,
        weight: { weight, unit: 'lb' },
      });
      temps.push({
        tempsId: `temps-${id}`,
        date: new Date(NOW.getTime() - (hours + 100) * 60 * 60_000),
        ChamberTemp: '210',
        MeatTemp: '40',
        Meat2Temp: '0',
        Meat3Temp: '0',
      });
    };

    it('leans on past cooks of the same meat while the cook is young', async () => {
      const live = startTheCook();
      live.preSmokeId = 'pre-live';
      live.startedAt = new Date(NOW.getTime() - 15 * 60_000);
      preSmokes.push({
        _id: 'pre-live',
        meatType: 'Brisket',
        weight: { weight: 4, unit: 'lb' },
      });
      // Past briskets: 10°F/hr on 4lb and 5°F/hr on 16lb both normalize to 20,
      // which at the 4lb on the smoker predicts 10°F/hr.
      pastCook('past-a', 'Brisket', 4, 16);
      pastCook('past-b', 'Brisket', 16, 32);
      // A quarter of an hour of its own, climbing at 20°F/hr: half the weight
      // on each, so 15°F/hr.
      temps.push(running(15, '145'), running(0, '150'));
      service = await build();

      const { estimate } = await service.getCurrentTimeline(NOW);

      expect(estimate.ratePerHour).toBeCloseTo(15, 5);
    });

    it('projects from the cook alone when the user has never smoked this meat', async () => {
      const live = startTheCook();
      live.preSmokeId = 'pre-live';
      live.startedAt = new Date(NOW.getTime() - 15 * 60_000);
      preSmokes.push({
        _id: 'pre-live',
        meatType: 'Brisket',
        weight: { weight: 4, unit: 'lb' },
      });
      pastCook('past-a', 'Pork Shoulder', 4, 16);
      pastCook('past-b', 'Pork Shoulder', 16, 32);
      temps.push(running(15, '145'), running(0, '150'));
      service = await build();

      const { estimate } = await service.getCurrentTimeline(NOW);

      expect(estimate.ratePerHour).toBeCloseTo(20, 5);
    });

    it('finds a past cook’s start under the rows recorded before the probe went in', async () => {
      const live = startTheCook();
      live.preSmokeId = 'pre-live';
      live.startedAt = new Date(NOW.getTime() - 15 * 60_000);
      preSmokes.push({
        _id: 'pre-live',
        meatType: 'Brisket',
        weight: { weight: 4, unit: 'lb' },
      });
      pastCook('past-a', 'Brisket', 4, 16);
      pastCook('past-b', 'Brisket', 16, 32);
      // Both cooks recorded a while with every meat probe reading zero — the
      // chamber coming up to heat before the meat went on.
      ['past-a', 'past-b'].forEach((id) => {
        temps.push({
          tempsId: `temps-${id}`,
          date: new Date(NOW.getTime() - 200 * 60 * 60_000),
          ChamberTemp: '180',
          MeatTemp: '0',
          Meat2Temp: '0',
          Meat3Temp: '0',
        });
      });
      temps.push(running(15, '145'), running(0, '150'));
      service = await build();

      const { estimate } = await service.getCurrentTimeline(NOW);

      // The same blend as when the zero rows are absent: the cooks are still in
      // the sample, started from their first real reading.
      expect(estimate.ratePerHour).toBeCloseTo(15, 5);
    });

    it('reads past cooks that recorded nothing without falling over', async () => {
      const live = startTheCook();
      live.preSmokeId = 'pre-live';
      live.startedAt = new Date(NOW.getTime() - 15 * 60_000);
      preSmokes.push({
        _id: 'pre-live',
        meatType: 'Brisket',
        weight: { weight: 4, unit: 'lb' },
      });
      pastCook('past-a', 'Brisket', 4, 16);
      pastCook('past-b', 'Brisket', 16, 32);
      // A cook that kept no series, and one whose pre-smoke was never saved.
      smokes.push(
        { _id: 'past-c', status: SmokeStatus.Complete, preSmokeId: 'pre-c' },
        { _id: 'past-d', status: SmokeStatus.Complete },
      );
      preSmokes.push({ _id: 'pre-c', meatType: 'Brisket', weight: {} });
      temps.push(running(15, '145'), running(0, '150'));
      service = await build();

      const { estimate } = await service.getCurrentTimeline(NOW);

      expect(estimate.ratePerHour).toBeCloseTo(15, 5);
    });

    describe('what it costs to poll', () => {
      /**
       * Every read of the running series must be bounded: by a lower bound on
       * the date, or by a row limit. A `find` over the whole series grows with
       * the length of the cook, and this route is polled for the whole of it.
       */
      const seriesReads = (): { filter: FakeDoc; limit?: number }[] => {
        const spy = models.temps.find as unknown as jest.Mock;
        return spy.mock.calls.map(([filter], index) => ({
          filter,
          limit: spy.mock.results[index].value.applied.limit,
        }));
      };

      it('never reads the running series whole', async () => {
        startTheCook();
        smokes[smokes.length - 1].startedAt = new Date(
          NOW.getTime() - 720 * 60_000,
        );
        // Twelve hours of a cook, a reading every two minutes, climbing 10°F/hr.
        for (let minutesAgo = 720; minutesAgo >= 0; minutesAgo -= 2) {
          temps.push(running(minutesAgo, String(160 - minutesAgo / 6)));
        }
        service = await build();
        jest.spyOn(models.temps, 'find');

        const { estimate, peakMeat } = await service.getCurrentTimeline(NOW);

        expect(peakMeat).toBe(160);
        expect(estimate.startTemp).toBe(40);
        expect(estimate.ratePerHour).toBeCloseTo(10, 5);
        expect(seriesReads().length).toBeGreaterThan(0);
        seriesReads().forEach(({ filter, limit }) => {
          expect(filter.date?.$gte ?? limit ?? null).not.toBeNull();
        });
      });

      it('leaves the user’s history unread once the cook has half an hour of its own', async () => {
        const live = startTheCook();
        live.preSmokeId = 'pre-live';
        preSmokes.push({
          _id: 'pre-live',
          meatType: 'Brisket',
          weight: { weight: 4, unit: 'lb' },
        });
        pastCook('past-a', 'Brisket', 4, 16);
        pastCook('past-b', 'Brisket', 16, 32);
        temps.push(running(45, '130'), running(30, '140'), running(0, '160'));
        service = await build();
        jest.spyOn(models.preSmokes, 'find');
        jest.spyOn(models.preSmokes, 'findById');

        const { estimate } = await service.getCurrentTimeline(NOW);

        // The probe's own half hour is the whole of the answer, so history
        // would only have been multiplied by nothing.
        expect(estimate.ratePerHour).toBeCloseTo(40, 5);
        expect(models.preSmokes.find).not.toHaveBeenCalled();
        expect(models.preSmokes.findById).not.toHaveBeenCalled();
      });

      it('leaves the user’s history unread when no probe is being watched', async () => {
        startTheCook();
        settings[0].probeTarget.probes = [
          { slot: 'probe1', enabled: false, target: 203 },
        ];
        temps.push(running(15, '145'), running(0, '150'));
        service = await build();
        jest.spyOn(models.preSmokes, 'findById');

        await service.getCurrentTimeline(NOW);

        expect(models.preSmokes.findById).not.toHaveBeenCalled();
      });

      it('leaves the user’s history unread once the meat is done', async () => {
        const live = startTheCook();
        live.preSmokeId = 'pre-live';
        preSmokes.push({ _id: 'pre-live', meatType: 'Brisket' });
        temps.push(running(15, '200'), running(0, '204'));
        service = await build();
        jest.spyOn(models.preSmokes, 'findById');

        const { estimate } = await service.getCurrentTimeline(NOW);

        expect(estimate.state).toBe('done');
        expect(models.preSmokes.findById).not.toHaveBeenCalled();
      });
    });

    it('stays done on a long cook whose target was passed hours ago', async () => {
      const live = startTheCook();
      live.startedAt = new Date(NOW.getTime() - 12 * 60 * 60_000);
      temps.push(
        running(700, '150'),
        // Passed its target six hours ago; resting, and cooling, since.
        running(360, '205'),
        running(15, '160'),
        running(0, '158'),
      );
      service = await build();

      expect((await service.getCurrentTimeline(NOW)).estimate.state).toBe(
        'done',
      );
    });

    it('reads a past cook older than the ten most recent', async () => {
      const live = startTheCook();
      live.preSmokeId = 'pre-live';
      live.startedAt = new Date(NOW.getTime() - 15 * 60_000);
      preSmokes.push({
        _id: 'pre-live',
        meatType: 'Brisket',
        weight: { weight: 4, unit: 'lb' },
      });
      pastCook('past-a', 'Brisket', 4, 16);
      pastCook('past-b', 'Brisket', 16, 32);
      // A dozen cooks of something else since, every one of them more recent
      // than the two briskets: a brisket is still estimated from briskets.
      for (let index = 0; index < 12; index += 1) {
        pastCook(`chicken-${index}`, 'Chicken', 5, 2);
      }
      temps.push(running(15, '145'), running(0, '150'));
      service = await build();

      const { estimate } = await service.getCurrentTimeline(NOW);

      expect(estimate.ratePerHour).toBeCloseTo(15, 5);
    });

    it('reads the clock itself when no moment is handed to it', async () => {
      const timeline = await service.getCurrentTimeline();

      expect(timeline.estimate.state).toBeNull();
    });

    it('suspends the projection while smoking is switched off', async () => {
      startTheCook();
      states[0].smoking = false;
      temps.push(running(60, '143'), running(30, '153'), running(0, '163'));
      service = await build();

      expect((await service.getCurrentTimeline(NOW)).estimate.state).toBe(
        'paused',
      );
    });
  });

  describe('stampStart', () => {
    it('records when the cook started', async () => {
      temps.length = 0;
      const before = Date.now();

      await service.stampStart('smoke-id');

      const { startedAt } = await service.getTimeline('smoke-id');
      expect(startedAt).not.toBeNull();
      expect(startedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(startedAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    /**
     * The stamp is written after the state that triggers it, so a failed write
     * is deferred to the next switch-on — hours into a cook that has been
     * recording all along. Taken at face value that start would sit in the
     * middle of its own cook, and everything that trusts it (the chart bound,
     * the duration) would call the cook's first hours something else. A cook
     * cannot have begun after the readings it has already taken, so the
     * earliest of them is the latest a start may be stamped at.
     */
    it('never stamps a start later than the readings the cook has already taken', async () => {
      await service.stampStart('smoke-id');

      expect((await service.getTimeline('smoke-id')).startedAt).toEqual(
        new Date('2026-08-01T10:05:00.000Z'),
      );
    });

    /**
     * A device whose clock runs ahead dates its readings in the future; the
     * cook still started when somebody pressed the button, not later.
     */
    it('stamps the moment of the press when the readings are dated ahead of it', async () => {
      temps.length = 0;
      temps.push(reading('2099-01-01T00:00:00.000Z', '210', '80'));
      const before = Date.now();

      await service.stampStart('smoke-id');

      const { startedAt } = await service.getTimeline('smoke-id');
      expect(startedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(startedAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('leaves the first start standing when smoking is toggled again', async () => {
      await service.stampStart('smoke-id');
      const first = (await service.getTimeline('smoke-id')).startedAt;

      await tick();
      await service.stampStart('smoke-id');

      expect((await service.getTimeline('smoke-id')).startedAt).toEqual(first);
    });
  });

  describe('stampFinish', () => {
    it('records the finish together with the target the watched probe was set to', async () => {
      settings.push({
        _id: 'settings-id',
        probeTarget: {
          enabled: true,
          probes: [
            { slot: 'probe1', enabled: false, target: 203 },
            { slot: 'probe2', enabled: true, target: 165 },
          ],
        },
      });
      const before = Date.now();

      await service.stampFinish('smoke-id');

      const { finishedAt, targetTemp } = await service.getTimeline('smoke-id');
      expect(targetTemp).toBe(165);
      expect(finishedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('snapshots no target when no probe was being watched', async () => {
      await service.stampFinish('smoke-id');

      expect((await service.getTimeline('smoke-id')).targetTemp).toBeNull();
    });

    it('leaves an already finished cook alone', async () => {
      await service.stampFinish('smoke-id');
      const first = (await service.getTimeline('smoke-id')).finishedAt;

      await tick();
      await service.stampFinish('smoke-id');

      expect((await service.getTimeline('smoke-id')).finishedAt).toEqual(first);
    });

    it('reads nothing of an already finished cook’s series', async () => {
      await service.stampFinish('smoke-id');
      const reads = jest.spyOn(models.temps, 'aggregate');

      await service.stampFinish('smoke-id');

      // A retried finish is rejected by the guard on the write, so scanning
      // the series first is a whole cook's readings read to be thrown away.
      expect(reads).not.toHaveBeenCalled();
    });

    it('stamps how hot the chamber ever ran onto the cook', async () => {
      await service.stampFinish('smoke-id');

      expect(smokes[0].peakChamber).toBe(268);
    });

    it('stamps the numerically hottest reading, not the alphabetically largest', async () => {
      temps = [
        reading('2026-08-01T10:05:00.000Z', '99', '80'),
        reading('2026-08-01T13:00:00.000Z', '245', '150'),
      ];
      service = await build();

      await service.stampFinish('smoke-id');

      expect(smokes[0].peakChamber).toBe(245);
    });

    it('stamps no peak for a cook that recorded no readings, and still finishes it', async () => {
      temps.length = 0;

      await service.stampFinish('smoke-id');

      expect(smokes[0].peakChamber ?? null).toBeNull();
      expect(smokes[0].finishedAt).toBeInstanceOf(Date);
    });

    /**
     * A reading may be stored without a moment — the archive holds plenty, and
     * the derivation behind `GET /timeline/:id` counts them. The manual finish
     * scans the whole series exactly as it always has, so pressing End Smoke on
     * a cook whose hottest reading was stored undated stamps that peak rather
     * than a lower one, and the stamp agrees with what the statistics backfill
     * would have found.
     */
    it('counts undated readings in the peak the manual finish stamps', async () => {
      temps.push({
        tempsId: 'temps-id',
        date: null,
        ChamberTemp: '301',
        MeatTemp: '150',
        Meat2Temp: '0',
        Meat3Temp: '0',
      });
      service = await build();

      await service.stampFinish('smoke-id');

      expect(smokes[0].peakChamber).toBe(301);
    });

    it('records that a cook with no readings was asked for a peak', async () => {
      temps.length = 0;

      await service.stampFinish('smoke-id');

      // So the statistics rebuild knows the answer was nothing, rather than
      // going back to its series for the same nothing every time.
      expect(smokes[0].peakChamberScanned).toBe(true);
    });
  });

  /**
   * Two clocks put a moment on a reading, and they can disagree by days: the
   * device stamps the date, the store stamps the id. Anything deciding a cook
   * has gone quiet needs the second one, which no device can be wrong about.
   */
  describe('lastReading', () => {
    it('reads the newest reading by the device clock and by the store’s', async () => {
      const accepted = new Date('2026-08-01T16:00:00.000Z');
      temps[2]._id = Types.ObjectId.createFromTime(accepted.getTime() / 1000);
      service = await build();

      const last = await service.lastReading(smokes[0]);

      expect(last?.readAt).toEqual(new Date('2026-08-01T15:55:00.000Z'));
      expect(last?.storedAt).toEqual(accepted);
    });

    // Nothing in the id to read a moment off — the caller falls back to the
    // device's account, which is all anything had before ids were looked at.
    it('says nothing about the store’s clock when the id cannot', async () => {
      const last = await service.lastReading(smokes[0]);

      expect(last?.readAt).toEqual(new Date('2026-08-01T15:55:00.000Z'));
      expect(last?.storedAt).toBeNull();
    });

    it('reads no reading at all for a cook that recorded none', async () => {
      temps.length = 0;
      service = await build();

      expect(await service.lastReading(smokes[0])).toBeNull();
    });
  });

  describe('stampFinishAt', () => {
    /** Where the real cook ended: its last reading before the box went quiet. */
    const COOK_ENDED = new Date('2026-08-01T15:55:00.000Z');

    it('records the cook as having finished at the moment it was given', async () => {
      await service.stampFinishAt('smoke-id', COOK_ENDED);

      expect(smokes[0].finishedAt).toEqual(COOK_ENDED);
    });

    /**
     * A session nobody ended keeps collecting whatever the box records next —
     * a hot grill firing weeks later lands in the old cook's series. That was
     * not this cook's chamber, so the peak is scanned over the cook's own
     * window and stops where the cook did.
     */
    it('scans the peak over the cook’s window and not the strays after it', async () => {
      temps.push(reading('2026-08-20T18:00:00.000Z', '470', '70'));
      service = await build();

      await service.stampFinishAt('smoke-id', COOK_ENDED);

      expect(smokes[0].peakChamber).toBe(268);
    });

    it('says whether this call is the one that stamped the finish', async () => {
      expect(await service.stampFinishAt('smoke-id', COOK_ENDED)).toBe(true);

      expect(await service.stampFinishAt('smoke-id', new Date())).toBe(false);
      expect(smokes[0].finishedAt).toEqual(COOK_ENDED);
    });

    it('stamps nothing for a cook that does not exist', async () => {
      expect(await service.stampFinishAt('no-such-smoke', COOK_ENDED)).toBe(
        false,
      );
    });
  });
});
