/**
 * The cook, as the overlay chart wants it: readings placed against elapsed
 * time, a length, a cook log and the names the pitmaster gave the probes.
 */
import { CompareCook } from '../../../api';
import { PostSmoke, PreSmoke, SmokeProfile, TempSample, rating } from '../../../api/types';
import { carbonLight, resolveDesignPalette } from '../../../theme';
import { compareSeriesOf } from './compareSeries';
import { UNNAMED_COOK } from './cookLabels';
import { WeightUnits } from '../../common/interfaces/enums';

const design = resolveDesignPalette(carbonLight, 'light');

const START = new Date('2026-08-01T06:00:00.000Z');
const at = (minutes: number): Date => new Date(START.getTime() + minutes * 60_000);

const sample = (minutes: number, over: Partial<TempSample> = {}): TempSample => ({
  date: at(minutes),
  chamberTemp: 225,
  probe1Temp: 140,
  probe2Temp: null,
  probe3Temp: null,
  ...over,
});

const profile: SmokeProfile = {
  chamberName: 'Pit',
  probe1Name: 'Brisket Flat',
  probe2Name: 'Point',
  probe3Name: '',
  notes: '',
  woodType: 'Oak',
};

const cook = (over: Partial<CompareCook> = {}): CompareCook => ({
  smokeId: 'smoke-a',
  name: 'Sunday Brisket',
  date: START,
  preSmoke: { weight: { weight: 12, unit: WeightUnits.LB } } as PreSmoke,
  smokeProfile: profile,
  postSmoke: { restTime: '01:00', steps: [] } as PostSmoke,
  rating: { smokeFlavor: 8, seasoning: 8, tenderness: 8, overallTaste: 8, notes: '' } as rating,
  timeline: {
    startedAt: START,
    finishedAt: at(300),
    durationMs: 300 * 60_000,
    peakChamber: 268,
    peakMeat: 203,
    targetTemp: 203,
  },
  events: [],
  series: [sample(0), sample(150), sample(300, { probe1Temp: 203 })],
  ...over,
});

describe('compareSeriesOf', () => {
  it('hands the chart the cook’s readings, position by position', () => {
    const series = compareSeriesOf(cook(), '#2A6FB8', design);

    expect(series.pts).toHaveLength(3);
    expect(series.pts[0]).toMatchObject({ chamber: 225, probe1: 140, probe2: null, probe3: null });
    expect(series.color).toBe('#2A6FB8');
  });

  it('takes the cook’s length from the timing the backend derived', () => {
    expect(compareSeriesOf(cook(), '#2A6FB8', design).mins).toBe(300);
  });

  it('falls back to the readings for a cook too old to have a derived timing', () => {
    expect(compareSeriesOf(cook({ timeline: null }), '#2A6FB8', design).mins).toBe(300);
  });

  it('has no length to give for a cook with neither timing nor readings', () => {
    expect(compareSeriesOf(cook({ timeline: null, series: [] }), '#2A6FB8', design).mins).toBe(0);
  });

  /**
   * The traces, the end marker and the stamps are all placed on one zero. A
   * cook whose first stored reading is later than its derived start — clipped,
   * or decimated away — would otherwise have its traces drawn from a start of
   * their own, minutes off the marks annotating them.
   */
  it('hands the chart the same start its length and its stamps are measured from', () => {
    const series = compareSeriesOf(
      cook({ series: [sample(60), sample(300, { probe1Temp: 203 })] }),
      '#2A6FB8',
      design
    );

    expect(series.startedAt).toBe(START.getTime());
  });

  it('gives the earliest reading as the start of a cook with no derived timing', () => {
    const series = compareSeriesOf(
      cook({ timeline: null, series: [sample(150), sample(60)] }),
      '#2A6FB8',
      design
    );

    expect(series.startedAt).toBe(at(60).getTime());
  });

  it('has no start to give for a cook with neither timing nor datable readings', () => {
    expect(compareSeriesOf(cook({ timeline: null, series: [] }), '#2A6FB8', design).startedAt).toBe(
      null
    );
  });

  it('names each position as the pitmaster named it', () => {
    expect(compareSeriesOf(cook(), '#2A6FB8', design).probeNames).toEqual({
      chamber: 'Pit',
      probe1: 'Brisket Flat',
      probe2: 'Point',
      probe3: '',
    });
  });

  it('places each stamp against the cook’s own start, in its tone', () => {
    const series = compareSeriesOf(
      cook({
        events: [
          {
            _id: 'event-1',
            smokeId: 'smoke-a',
            stampKey: 'wrapped',
            label: 'Wrapped',
            tone: 'p1',
            at: at(90),
            chamberTemp: null,
            probe1Temp: null,
            probe2Temp: null,
            probe3Temp: null,
          },
        ],
      }),
      '#2A6FB8',
      design
    );

    expect(series.stamps).toEqual([
      { id: 'event-1', label: 'Wrapped', minutes: 90, color: design.probes.probe1 },
    ]);
  });

  it('places a stamp on a cook with no derived start against its first reading', () => {
    const series = compareSeriesOf(
      cook({
        timeline: null,
        events: [
          {
            _id: 'event-1',
            smokeId: 'smoke-a',
            stampKey: 'wrapped',
            label: 'Wrapped',
            tone: 'p1',
            at: at(30),
            chamberTemp: null,
            probe1Temp: null,
            probe2Temp: null,
            probe3Temp: null,
          },
        ],
      }),
      '#2A6FB8',
      design
    );

    expect(series.stamps[0].minutes).toBe(30);
  });

  it('drops a stamp from a cook there is nothing to place it against', () => {
    const series = compareSeriesOf(
      cook({
        timeline: null,
        series: [],
        events: [
          {
            _id: 'event-1',
            smokeId: 'smoke-a',
            stampKey: 'wrapped',
            label: 'Wrapped',
            tone: 'p1',
            at: at(30),
            chamberTemp: null,
            probe1Temp: null,
            probe2Temp: null,
            probe3Temp: null,
          },
        ],
      }),
      '#2A6FB8',
      design
    );

    expect(series.stamps).toEqual([]);
  });
});

describe('what the chart calls each cook', () => {
  it('carries the cook’s own name through to the chart’s key', () => {
    expect(compareSeriesOf(cook(), '#2A6FB8', design).name).toBe('Sunday Brisket');
  });

  it('spells a cook nobody named the way the rest of the comparison spells it', () => {
    expect(compareSeriesOf(cook({ name: '' }), '#2A6FB8', design).name).toBe(UNNAMED_COOK);
  });
});
