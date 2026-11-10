import { expect, test } from '@playwright/test';
import { FetchTransport } from '../src/api/http-transport';
import { TEST_ENTITY_PREFIX } from '../src/api/test-entity';
import { resolveUrls } from '../src/config/urls';
import {
  PLANTED_AT,
  backendLogLines,
  hermeticStoreReady,
  mongoEval,
  restartBackend,
  sweepPlantedCooks,
} from '../src/helpers/hermetic-store';

/**
 * Two legacy cooks are planted, both starting hotter than anything the archive
 * holds and cooling, so the restored reading is each cook's peak and nothing
 * else can be mistaken for it.
 *
 * The **unstamped** cook carries no start, as the cooks recorded before that
 * stamp existed do, so its beginning is derived from its series on every read.
 * The **stamped** cook carries the start a later pass wrote for it from a read
 * that could not see the first reading — its *second* — and its readings are
 * spaced far enough apart that the window that start bounds excludes the first
 * reading even once the reading is back in the series.
 */
const UNSTAMPED = { head: 450, tail: [232, 240], stalePeak: 240 };
const STAMPED = { head: 455, tail: [233, 241], stalePeak: 241 };

/** What the repair says when it has put a first reading back. */
const REPAIR_LOG = 'TempSeriesBackfill';

/**
 * Cooks recorded the way the old write left them: a first reading carrying no
 * series id at all, readings carrying it, and a finished cook whose peak was
 * stamped over the ones the reads could see.
 *
 * Each cook links a prefixed pre-smoke, so a cook planted by hand is the same
 * shape as a cook the fixture seeds — one the cook list can resolve a name for
 * like any other, and one `api/test-entity.ts`'s net recognises.
 */
const PLANT_LEGACY_COOKS = `
  const base = new Date('${PLANTED_AT}');
  const at = (minutes) => new Date(base.getTime() + minutes * 60_000);
  const reading = (chamber, meat, when, seriesId) => Object.assign(
    { ChamberTemp: String(chamber), MeatTemp: String(meat), Meat2Temp: '0', Meat3Temp: '0', date: when },
    seriesId ? { tempsId: seriesId } : {},
  );
  const plant = (chambers, minutes, stamps) => {
    const head = new ObjectId();
    db.temps.insertOne(Object.assign({ _id: head }, reading(chambers[0], 70, at(minutes[0]), null)));
    db.temps.insertMany(chambers.slice(1).map(
      (chamber, index) => reading(chamber, 120 + index * 45, at(minutes[index + 1]), head.toString()),
    ));
    const pre = db.presmokes.insertOne({
      name: '${TEST_ENTITY_PREFIX}planted-legacy-cook',
      meatType: 'brisket',
      weight: { unit: 'Lb', weight: 12 },
      steps: [],
      notes: 'planted by tests/temp-series-repair.spec.ts',
    });
    const cook = db.smokes.insertOne(Object.assign({
      tempsId: head.toString(),
      preSmokeId: pre.insertedId.toString(),
      date: at(minutes[0]),
      status: 1,
    }, stamps));
    return head.toString() + ' ' + cook.insertedId.toString();
  };
  const unstamped = plant([${UNSTAMPED.head}, ${UNSTAMPED.tail.join(', ')}], [0, 1, 2], {
    finishedAt: at(2),
    peakChamber: ${UNSTAMPED.stalePeak},
    peakChamberScanned: true,
  });
  const stamped = plant([${STAMPED.head}, ${STAMPED.tail.join(', ')}], [60, 80, 100], {
    startedAt: at(80),
    finishedAt: at(100),
    peakChamber: ${STAMPED.stalePeak},
    peakChamberScanned: true,
  });
  // Planting rows by hand is exactly what the stored statistics cannot see
  // coming, so they are told, the way the sweep tells them.
  // db.stats is mongosh's own command, so the collection is asked by name.
  db.getCollection('stats').updateOne({}, { $set: { dirty: true } });
  print(unstamped + ' ' + stamped);
`;

/**
 * The peak this cook is stamped with, and whether it has been searched for —
 * read from the store because it is the cook's own record, where
 * `GET /stats` serves one number for the whole archive and some other
 * journey's cook may be the hotter one.
 */
const peakStampOf = (cookId: string) =>
  `const cook = db.smokes.findOne({ _id: ObjectId('${cookId}') }); print(cook.peakChamber + ' ' + cook.peakChamberScanned);`;

const seriesOf = (seriesId: string) =>
  `print(db.temps.find({ tempsId: '${seriesId}' }).sort({ date: 1 }).toArray().map(r => r.ChamberTemp).join(','));`;

interface StoredReading {
  ChamberTemp: string;
}

interface Timeline {
  startedAt: string | null;
  durationMs: number | null;
  peakChamber: number | null;
}

/** The planted moments, as the store holds them. */
const minutesIn = (minutes: number) =>
  new Date(new Date(PLANTED_AT).getTime() + minutes * 60_000).toISOString();

const chambersOf = (readings: StoredReading[]) => readings.map(reading => reading.ChamberTemp);

const whole = (cook: { head: number; tail: number[] }) => [cook.head, ...cook.tail].map(String);

/**
 * Holds a composed run to actually having its store, rather than skipping over
 * a missing one.
 *
 * `hermeticStoreReady()` answers no both for a stack that is not there and for
 * a `docker` that cannot be reached or containers that have been renamed, so
 * skipping on it alone would leave the PR gate green with the repair unproven.
 * In the `hermetic` project the store is part of the target, so its absence is
 * a failure; against a deployed stack the spec has no business running at all —
 * planting rows in a real archive is not something a test may do.
 */
const needsTheHermeticStore = () => {
  if (test.info().project.name !== 'hermetic') {
    test.skip(
      true,
      'the repair is proved by planting rows and booting, which only the composed stack allows'
    );
    return;
  }
  expect(hermeticStoreReady(), 'the hermetic stack must expose its own store and backend').toBe(
    true
  );
};

/**
 * The repair of the cooks already in the database, proved against two.
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
  needsTheHermeticStore();
  test.setTimeout(300_000);

  const backend = new FetchTransport(resolveUrls().backend);
  // Counted rather than assumed to be none: a retry of this spec runs against
  // a backend whose log already carries what the attempt before it said.
  const repairsAlreadyAnnounced = backendLogLines(REPAIR_LOG).length;
  // Nothing of an earlier attempt's is left to be mistaken for this one's.
  sweepPlantedCooks();
  const [unstampedSeries, unstampedCook, stampedSeries] = mongoEval(PLANT_LEGACY_COOKS).split(' ');
  expect(unstampedSeries, 'the legacy cooks must have been planted').toMatch(/^[a-f0-9]{24}$/);
  expect(stampedSeries, 'the legacy cooks must have been planted').toMatch(/^[a-f0-9]{24}$/);

  try {
    // As the orphaned shape reads: each cook's first reading is in the store,
    // and absent from every read of its series.
    expect(chambersOf(await backend.get(`/api/temps/${unstampedSeries}`))).toEqual(
      UNSTAMPED.tail.map(String)
    );
    // And each cook is stamped with the peak of the readings that could be
    // read, a stamp nothing re-derives: the statistics are served from a
    // stored aggregate whose guard counts completed cooks, and a repair moves
    // none.
    await backend.get<unknown>('/api/stats');
    expect(mongoEval(peakStampOf(unstampedCook))).toBe(`${UNSTAMPED.stalePeak} true`);
    // The unstamped cook's beginning is derived from the series on every read,
    // and without its first reading it reads as having begun a minute late.
    const staleTimeline = await backend.get<Timeline>(`/api/timeline/${unstampedCook}`);
    expect(staleTimeline.startedAt).toBe(minutesIn(1));
    expect(backendLogLines(REPAIR_LOG)).toHaveLength(repairsAlreadyAnnounced);

    await restartBackend();

    // The reading is back in its series, and the store agrees it is stamped.
    expect(chambersOf(await backend.get(`/api/temps/${unstampedSeries}`))).toEqual(
      whole(UNSTAMPED)
    );
    expect(mongoEval(seriesOf(unstampedSeries))).toBe(whole(UNSTAMPED).join(','));
    expect(backendLogLines(REPAIR_LOG)).toHaveLength(repairsAlreadyAnnounced + 1);

    // The timeline counts it: the cook begins when it began — derived from the
    // readings themselves, this cook carrying no start stamp — and its peak is
    // the reading it started hot with.
    const timeline = await backend.get<Timeline>(`/api/timeline/${unstampedCook}`);
    expect(timeline.startedAt).toBe(minutesIn(0));
    expect(timeline.peakChamber).toBe(UNSTAMPED.head);

    // And the stamp derived without the reading is moved by the repair itself,
    // not left to a later scan: the restored reading is the hotter of the two
    // numbers, which is arithmetic.
    expect(mongoEval(peakStampOf(unstampedCook))).toBe(`${UNSTAMPED.head} true`);

    // Running it twice changes nothing: the second boot finds no orphan, so it
    // stamps nothing, says nothing, and leaves the repaired series alone.
    await restartBackend();

    expect(backendLogLines(REPAIR_LOG)).toHaveLength(repairsAlreadyAnnounced + 1);
    expect(mongoEval(seriesOf(unstampedSeries))).toBe(whole(UNSTAMPED).join(','));
    await backend.get<unknown>('/api/stats');
    expect(mongoEval(peakStampOf(unstampedCook))).toBe(`${UNSTAMPED.head} true`);
  } finally {
    sweepPlantedCooks();
  }
});

/**
 * The cook whose *start* was stamped without its first reading, which is the
 * shape that makes restoring the reading insufficient on its own.
 *
 * A stored series is clipped to its cook's window, and the lower bound of that
 * window is the stamped start less fifteen minutes of clock slack (see
 * `CLOCK_SKEW_TOLERANCE_MS`). A cook stamped from its second reading, more than
 * that slack after its first, therefore clips the restored reading straight
 * back out: the cook would report a peak only the restored reading can explain
 * while every chart drawn from its series still topped out at the second one.
 * So the repair moves the start back too — which is also the cook's real
 * beginning and its real length.
 *
 * Plants and boots on its own rather than sharing the journey above's: the
 * repair runs once over whatever the store holds at that boot, so a cook read
 * before it and after it has to be planted before the boot that repairs it.
 */
test('temp series repair: a cook stamped from its second reading is moved back to its first', async () => {
  needsTheHermeticStore();
  test.setTimeout(300_000);

  const backend = new FetchTransport(resolveUrls().backend);
  sweepPlantedCooks();
  const [, , series, cookId] = mongoEval(PLANT_LEGACY_COOKS).split(' ');
  expect(series, 'the legacy cooks must have been planted').toMatch(/^[a-f0-9]{24}$/);

  try {
    // The stamped shape, as it reads: two of the three readings, a cook that
    // began twenty minutes after it did, and twenty of its forty minutes.
    expect(chambersOf(await backend.get(`/api/temps/${series}`))).toEqual(STAMPED.tail.map(String));
    const stale = await backend.get<Timeline>(`/api/timeline/${cookId}`);
    expect(stale.startedAt).toBe(minutesIn(80));
    expect(stale.durationMs).toBe(20 * 60_000);

    await restartBackend();

    // The whole series reads back, which it could not do while the stamped
    // start bounded the window twenty minutes after the restored reading.
    expect(chambersOf(await backend.get(`/api/temps/${series}`))).toEqual(whole(STAMPED));
    const repaired = await backend.get<Timeline>(`/api/timeline/${cookId}`);
    expect(repaired.startedAt).toBe(minutesIn(60));
    expect(repaired.durationMs).toBe(40 * 60_000);
    expect(repaired.peakChamber).toBe(STAMPED.head);
    expect(mongoEval(peakStampOf(cookId))).toBe(`${STAMPED.head} true`);

    // And the chart-ready read, which the frontend and the smoker page draw
    // from, is the same whole series.
    const samples = await backend.get<{ chamberTemp: number }[]>(`/api/temps/${series}/series`);
    expect(samples.map(sample => sample.chamberTemp)).toEqual([STAMPED.head, ...STAMPED.tail]);
  } finally {
    sweepPlantedCooks();
  }
});
