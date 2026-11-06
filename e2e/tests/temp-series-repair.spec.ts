import { expect, test } from '@playwright/test';
import { FetchTransport } from '../src/api/http-transport';
import { resolveUrls } from '../src/config/urls';
import {
  backendLogLines,
  hermeticStoreReady,
  mongoEval,
  restartBackend,
} from '../src/helpers/hermetic-store';

/**
 * The legacy cook this plants: a chamber that starts hotter than anything the
 * archive holds and cools, so the restored reading is the cook's peak and
 * nothing else in the archive can be mistaken for it.
 */
const LEGACY_HEAD_CHAMBER = 450;
const LEGACY_TAIL_CHAMBERS = [232, 240];

/** The peak the cook was stamped with when its first reading was invisible. */
const STALE_PEAK = 240;

/** What the repair says when it has put a first reading back. */
const REPAIR_LOG = 'TempSeriesBackfill';

/**
 * A cook recorded the way the old write left them: a first reading carrying no
 * series id, two readings carrying it, and a finished cook whose peak was
 * stamped over the two the reads could see.
 *
 * Carries no start stamp, as the cooks recorded before that stamp existed do,
 * so the cook's beginning is derived from its series on every read — which is
 * the edge lookup, asked the same question the peak scan is asked.
 */
const PLANT_LEGACY_COOK = `
  const head = new ObjectId();
  const base = new Date('2026-01-02T10:00:00Z');
  const at = (seconds) => new Date(base.getTime() + seconds * 1000);
  const reading = (chamber, meat, when, seriesId) => Object.assign(
    { ChamberTemp: String(chamber), MeatTemp: String(meat), Meat2Temp: '0', Meat3Temp: '0', date: when },
    seriesId ? { tempsId: seriesId } : {},
  );
  db.temps.insertOne(Object.assign({ _id: head }, reading(${LEGACY_HEAD_CHAMBER}, 70, base, null)));
  db.temps.insertMany([
    reading(${LEGACY_TAIL_CHAMBERS[0]}, 120, at(60), head.toString()),
    reading(${LEGACY_TAIL_CHAMBERS[1]}, 165, at(120), head.toString()),
  ]);
  const cook = db.smokes.insertOne({
    tempsId: head.toString(),
    date: base,
    finishedAt: at(120),
    status: 1,
    peakChamber: ${STALE_PEAK},
    peakChamberScanned: true,
  });
  // Planting rows by hand is exactly what the stored statistics cannot see
  // coming, so they are told, the way the cleanup below tells them.
  // db.stats is mongosh's own command, so the collection is asked by name.
  db.getCollection('stats').updateOne({}, { $set: { dirty: true } });
  print(head.toString() + ' ' + cook.insertedId.toString());
`;

const forget = (seriesId: string, cookId: string) => `
  db.temps.deleteMany({ $or: [{ _id: ObjectId('${seriesId}') }, { tempsId: '${seriesId}' }] });
  db.smokes.deleteOne({ _id: ObjectId('${cookId}') });
  // db.stats is mongosh's own command, so the collection is asked by name.
  db.getCollection('stats').updateOne({}, { $set: { dirty: true } });
  print('forgotten');
`;

const seriesOf = (seriesId: string) =>
  `print(db.temps.find({ tempsId: '${seriesId}' }).sort({ date: 1 }).toArray().map(r => r.ChamberTemp).join(','));`;

interface StoredReading {
  ChamberTemp: string;
}

interface Records {
  records: { hottestChamber: { value: number } | null };
}

interface Timeline {
  startedAt: string | null;
  peakChamber: number | null;
}

/** When the planted cook's readings were taken, as the store holds them. */
const HEAD_AT = '2026-01-02T10:00:00.000Z';
const SECOND_AT = '2026-01-02T10:01:00.000Z';

/**
 * The repair of the cooks already in the database, proved against one.
 *
 * A cook's series is named after its own first reading, and that reading used
 * to be written before the id existed — so it carried none, while every read
 * of a series asks the store for one (issue #755). The write is fixed; the
 * rows the old write left behind are repaired at boot, and this is the only
 * place that repair can be proved. Rows of that shape cannot be made through
 * the API any more, and whether a stored reading with no `tempsId` field at
 * all answers the query that looks for one — and stops answering it once
 * stamped — is a question only a real Mongo can be asked.
 *
 * Untagged, so it runs in the `hermetic` project alone, and skipped outright
 * unless this run owns the stack: it plants rows and restarts a service.
 */
test('temp series repair: a legacy cook reads back whole, and twice over', async () => {
  test.skip(
    !hermeticStoreReady(),
    'needs the composed stack: the repair is proved by planting rows and booting'
  );
  test.setTimeout(300_000);

  const backend = new FetchTransport(resolveUrls().backend);
  // Counted rather than assumed to be none: a retry of this spec runs against
  // a backend whose log already carries what the attempt before it said.
  const repairsAlreadyAnnounced = backendLogLines(REPAIR_LOG).length;
  const [seriesId, cookId] = mongoEval(PLANT_LEGACY_COOK).split(' ');
  expect(seriesId, 'the legacy cook must have been planted').toMatch(/^[a-f0-9]{24}$/);

  try {
    // As the orphaned shape reads: the cook's first reading is in the store,
    // and absent from every read of its series.
    const before = await backend.get<StoredReading[]>(`/api/temps/${seriesId}`);
    expect(before.map(reading => reading.ChamberTemp)).toEqual(LEGACY_TAIL_CHAMBERS.map(String));
    const staleRecords = await backend.get<Records>('/api/stats');
    expect(staleRecords.records.hottestChamber?.value).not.toBe(LEGACY_HEAD_CHAMBER);
    // The cook carries no start stamp, so its beginning is derived from the
    // series on every read — and without its first reading it reads as having
    // begun a minute after it did.
    const staleTimeline = await backend.get<Timeline>(`/api/timeline/${cookId}`);
    expect(staleTimeline.startedAt).toBe(SECOND_AT);
    expect(backendLogLines(REPAIR_LOG)).toHaveLength(repairsAlreadyAnnounced);

    await restartBackend();

    // The reading is back in its series, and the store agrees it is stamped.
    const repaired = await backend.get<StoredReading[]>(`/api/temps/${seriesId}`);
    expect(repaired.map(reading => reading.ChamberTemp)).toEqual(
      [LEGACY_HEAD_CHAMBER, ...LEGACY_TAIL_CHAMBERS].map(String)
    );
    expect(mongoEval(seriesOf(seriesId))).toBe(
      [LEGACY_HEAD_CHAMBER, ...LEGACY_TAIL_CHAMBERS].join(',')
    );
    expect(backendLogLines(REPAIR_LOG)).toHaveLength(repairsAlreadyAnnounced + 1);

    // The edge lookup and the peak scan now count it: the cook begins when it
    // began, and its peak is the reading it started hot with.
    const timeline = await backend.get<Timeline>(`/api/timeline/${cookId}`);
    expect(timeline.startedAt).toBe(HEAD_AT);
    expect(timeline.peakChamber).toBe(LEGACY_HEAD_CHAMBER);

    // And what was derived once and stored is derived again: the cook's
    // stamped peak was the hottest of the two readings that could be read, and
    // the statistics served it until the repair said the archive had changed.
    const records = await backend.get<Records>('/api/stats');
    expect(records.records.hottestChamber?.value).toBe(LEGACY_HEAD_CHAMBER);

    // Running it twice changes nothing: the second boot finds no orphan, so it
    // stamps nothing, says nothing, and leaves the repaired series alone.
    await restartBackend();

    expect(backendLogLines(REPAIR_LOG)).toHaveLength(repairsAlreadyAnnounced + 1);
    expect(mongoEval(seriesOf(seriesId))).toBe(
      [LEGACY_HEAD_CHAMBER, ...LEGACY_TAIL_CHAMBERS].join(',')
    );
    const after = await backend.get<Records>('/api/stats');
    expect(after.records.hottestChamber?.value).toBe(LEGACY_HEAD_CHAMBER);
  } finally {
    mongoEval(forget(seriesId, cookId));
  }
});
