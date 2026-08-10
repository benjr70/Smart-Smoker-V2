import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SmokeStatus } from '../smoke/smoke.schema';
import { ApplicationSettings } from '../appSettings/app-settings.schema';
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

  const build = async (): Promise<TimelineService> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimelineService,
        { provide: getModelToken('Smoke'), useValue: fakeModel(smokes) },
        { provide: getModelToken('Temp'), useValue: fakeModel(temps) },
        {
          provide: getModelToken(ApplicationSettings.name),
          useValue: fakeModel(settings),
        },
      ],
    }).compile();
    return module.get<TimelineService>(TimelineService);
  };

  beforeEach(async () => {
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

  describe('stampStart', () => {
    it('records when the cook started', async () => {
      const before = Date.now();

      await service.stampStart('smoke-id');

      const { startedAt } = await service.getTimeline('smoke-id');
      expect(startedAt).not.toBeNull();
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
  });
});
