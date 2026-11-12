import { Model } from 'mongoose';
import { FakeDoc, fakeModel } from '../timeline/testing/fake-model';
import { TempDocument } from './temps.schema';
import {
  edgeReadingRow,
  peakChamberOf,
  peakChambersOf,
  watchedProbeTemp,
} from './series-reads';

/**
 * The series reads the cook's stamps and the cook's timeline share. Tested
 * here because both of its callers only ever ask about one well-formed series:
 * a cook that recorded nothing, a row with no date and a reading that cannot
 * be read as a number are the cases that decide whether a cook is stamped with
 * a wrong moment or none at all, and neither caller's spec puts them.
 */
describe('the shared series reads', () => {
  let readings: FakeDoc[];
  const tempModel = (): Model<TempDocument> =>
    fakeModel(readings) as unknown as Model<TempDocument>;

  beforeEach(() => {
    readings = [];
  });

  describe('the row at one end of a series', () => {
    it('answers nothing for a cook that recorded no series at all', async () => {
      readings.push({
        tempsId: 'temps-1',
        date: new Date('2024-05-01T10:00:00Z'),
      });

      expect(await edgeReadingRow(tempModel(), {}, 1)).toBeNull();
    });

    it('answers the earliest dated row of the cook, ascending', async () => {
      readings.push(
        {
          tempsId: 'temps-1',
          ChamberTemp: '200',
          date: new Date('2024-05-01T12:00:00Z'),
        },
        {
          tempsId: 'temps-1',
          ChamberTemp: '150',
          date: new Date('2024-05-01T10:00:00Z'),
        },
      );

      const edge = await edgeReadingRow(tempModel(), { tempsId: 'temps-1' }, 1);

      expect(edge?.ChamberTemp).toBe('150');
    });

    it('answers the latest dated row of the cook, descending', async () => {
      readings.push(
        {
          tempsId: 'temps-1',
          ChamberTemp: '200',
          date: new Date('2024-05-01T12:00:00Z'),
        },
        {
          tempsId: 'temps-1',
          ChamberTemp: '150',
          date: new Date('2024-05-01T10:00:00Z'),
        },
      );

      const edge = await edgeReadingRow(
        tempModel(),
        { tempsId: 'temps-1' },
        -1,
      );

      expect(edge?.ChamberTemp).toBe('200');
    });

    /**
     * A row with no date sorts ahead of the whole cook, so taking it as the
     * first reading would hand back a moment-less row and the cook would read
     * as having no duration.
     */
    it('passes over a row that cannot say when it was read', async () => {
      readings.push(
        { tempsId: 'temps-1', ChamberTemp: '999', date: null },
        {
          tempsId: 'temps-1',
          ChamberTemp: '150',
          date: new Date('2024-05-01T10:00:00Z'),
        },
      );

      const edge = await edgeReadingRow(tempModel(), { tempsId: 'temps-1' }, 1);

      expect(edge?.ChamberTemp).toBe('150');
    });

    it('answers nothing where the cook recorded a series but no row of it survives', async () => {
      expect(
        await edgeReadingRow(tempModel(), { tempsId: 'temps-1' }, 1),
      ).toBeNull();
    });
  });

  describe('what the watched probe read last', () => {
    /** A cook whose last row is newer than any slice a projection would hold. */
    const aSilentSmoker = (): void => {
      readings.push(
        {
          tempsId: 'temps-1',
          MeatTemp: '120',
          date: new Date('2024-05-01T10:00:00Z'),
        },
        {
          tempsId: 'temps-1',
          MeatTemp: '190',
          date: new Date('2024-05-01T18:00:00Z'),
        },
      );
    };

    it('answers the newest dated row of the series, however long ago it was', async () => {
      aSilentSmoker();

      expect(
        await watchedProbeTemp(tempModel(), { tempsId: 'temps-1' }, 'probe1'),
      ).toBe(190);
    });

    it('answers nothing when no probe is being watched', async () => {
      aSilentSmoker();

      expect(
        await watchedProbeTemp(tempModel(), { tempsId: 'temps-1' }, null),
      ).toBeNull();
    });

    it('answers nothing when the cook has read nothing at all', async () => {
      expect(
        await watchedProbeTemp(tempModel(), { tempsId: 'temps-1' }, 'probe1'),
      ).toBeNull();
    });

    /** An unplugged probe's zero is not a temperature anything took. */
    it('answers nothing where the watched probe read zero', async () => {
      readings.push({
        tempsId: 'temps-1',
        MeatTemp: '0',
        date: new Date('2024-05-01T10:00:00Z'),
      });

      expect(
        await watchedProbeTemp(tempModel(), { tempsId: 'temps-1' }, 'probe1'),
      ).toBeNull();
    });
  });

  describe('the hottest chamber of many series', () => {
    it('asks nothing of the store when no series was named', async () => {
      const model = tempModel();
      const asked = jest.spyOn(model, 'aggregate');

      expect(await peakChambersOf(model, [])).toEqual(new Map());
      expect(asked).not.toHaveBeenCalled();
    });

    it('answers the peak of each series asked about', async () => {
      readings.push(
        {
          tempsId: 'temps-1',
          ChamberTemp: '245',
          date: new Date('2024-05-01T10:00:00Z'),
        },
        {
          tempsId: 'temps-1',
          ChamberTemp: '99',
          date: new Date('2024-05-01T11:00:00Z'),
        },
        {
          tempsId: 'temps-2',
          ChamberTemp: '310',
          date: new Date('2024-05-02T10:00:00Z'),
        },
      );

      const peaks = await peakChambersOf(tempModel(), ['temps-1', 'temps-2']);

      expect(peaks.get('temps-1')).toBe(245);
      expect(peaks.get('temps-2')).toBe(310);
    });

    it('leaves out a series nothing readable was recorded for', async () => {
      readings.push(
        {
          tempsId: 'temps-1',
          ChamberTemp: '',
          date: new Date('2024-05-01T10:00:00Z'),
        },
        {
          tempsId: 'temps-1',
          ChamberTemp: 'n/a',
          date: new Date('2024-05-01T11:00:00Z'),
        },
      );

      const peaks = await peakChambersOf(tempModel(), ['temps-1']);

      expect(peaks.has('temps-1')).toBe(false);
    });

    /**
     * The box fired up again weeks later writes into the same series; the
     * hottest of those later rows is not a fact about the cook that ended.
     */
    it('counts only the rows inside the cook’s window when bounded', async () => {
      readings.push(
        {
          tempsId: 'temps-1',
          ChamberTemp: '245',
          date: new Date('2024-05-01T10:00:00Z'),
        },
        {
          tempsId: 'temps-1',
          ChamberTemp: '500',
          date: new Date('2024-06-01T10:00:00Z'),
        },
        { tempsId: 'temps-1', ChamberTemp: '600', date: null },
      );

      const peaks = await peakChambersOf(
        tempModel(),
        ['temps-1'],
        new Date('2024-05-01T20:00:00Z'),
      );

      expect(peaks.get('temps-1')).toBe(245);
    });
  });

  describe('the hottest chamber of one cook', () => {
    it('answers nothing for a cook that recorded no series', async () => {
      expect(await peakChamberOf(tempModel(), {})).toBeNull();
    });

    it('answers nothing where the series recorded nothing readable', async () => {
      readings.push({
        tempsId: 'temps-1',
        ChamberTemp: 'n/a',
        date: new Date('2024-05-01T10:00:00Z'),
      });

      expect(
        await peakChamberOf(tempModel(), { tempsId: 'temps-1' }),
      ).toBeNull();
    });

    it('answers the peak of the cook’s own series', async () => {
      readings.push(
        {
          tempsId: 'temps-1',
          ChamberTemp: '245',
          date: new Date('2024-05-01T10:00:00Z'),
        },
        {
          tempsId: 'temps-2',
          ChamberTemp: '500',
          date: new Date('2024-05-01T10:00:00Z'),
        },
      );

      expect(await peakChamberOf(tempModel(), { tempsId: 'temps-1' })).toBe(
        245,
      );
    });
  });
});
