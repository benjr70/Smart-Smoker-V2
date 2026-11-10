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
 * Four legacy cooks are planted, each starting hotter than anything the archive
 * holds and cooling, so the restored reading is the cook's peak wherever it is
 * one and nothing else can be mistaken for it.
 *
 * The **unstamped** cook carries no start, as the cooks recorded before that
 * stamp existed do, so its beginning is derived from its series on every read.
 * The **stamped** cook carries the start a later pass wrote for it from a read
 * that could not see the first reading — its *second* — and its readings are
 * spaced far enough apart that the window that start bounds excludes the first
 * reading even once the reading is back in the series.
 *
 * The **misclocked** cook carries a finish and no start, which is what a failed
 * start stamp leaves behind, and a first reading dated hours *after* that
 * finish, which is what a device whose clock was wrong leaves behind. Its
 * restored reading is no fact about it, and a repair that stamped the cook as
 * beginning there would cut a window with nothing inside it at all.
 *
 * The **quiet** cook is the same question asked from the other side: a cook
 * already healed by `StatsService.stampCookWindows`, with an orphaned reading
 * dated two hours *before* the block of readings it carries — the box fired up
 * and left, then loaded hours later. Nothing in the cook's own stamps refuses
 * it; the silence between it and the rest of its series does.
 */
const UNSTAMPED = { head: 450, tail: [232, 240], stalePeak: 240 };
const STAMPED = { head: 455, tail: [233, 241], stalePeak: 241 };
const MISCLOCKED = { head: 460, tail: [234, 242], stalePeak: 242 };
const QUIET = { head: 470, tail: [235, 236], stalePeak: 236 };

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
    return { series: head.toString(), cook: cook.insertedId.toString() };
  };
  const planted = {
    unstamped: plant([${UNSTAMPED.head}, ${UNSTAMPED.tail.join(', ')}], [0, 1, 2], {
      finishedAt: at(2),
      peakChamber: ${UNSTAMPED.stalePeak},
      peakChamberScanned: true,
    }),
    stamped: plant([${STAMPED.head}, ${STAMPED.tail.join(', ')}], [60, 80, 100], {
      startedAt: at(80),
      finishedAt: at(100),
      peakChamber: ${STAMPED.stalePeak},
      peakChamberScanned: true,
    }),
    // The head is dated at minute 200, hours after the finish at minute 121.
    misclocked: plant([${MISCLOCKED.head}, ${MISCLOCKED.tail.join(', ')}], [200, 120, 121], {
      finishedAt: at(121),
      peakChamber: ${MISCLOCKED.stalePeak},
      peakChamberScanned: true,
    }),
    // The head is dated at minute 300, two hours of quiet before the two
    // readings the cook's own healed window was cut from.
    quiet: plant([${QUIET.head}, ${QUIET.tail.join(', ')}], [300, 420, 421], {
      startedAt: at(420),
      finishedAt: at(421),
      peakChamber: ${QUIET.stalePeak},
      peakChamberScanned: true,
      cookWindowBackfilled: true,
    }),
  };
  // Planting rows by hand is exactly what the stored statistics cannot see
  // coming, so they are told, the way the sweep tells them.
  // db.stats is mongosh's own command, so the collection is asked by name.
  db.getCollection('stats').updateOne({}, { $set: { dirty: true } });
  print(JSON.stringify(planted));
`;

/** A planted cook: the series it owns, and the cook document over it. */
interface PlantedCook {
  series: string;
  cook: string;
}

/**
 * Plants the legacy cooks and answers each of them by name.
 *
 * Named rather than printed as a row of ids to be taken apart positionally: a
 * spec reads one of the three, and a fourth shape planted later must not be
 * able to move another spec's cook out from under it.
 */
const plantLegacyCooks = (): Record<
  'unstamped' | 'stamped' | 'misclocked' | 'quiet',
  PlantedCook
> => {
  const planted = JSON.parse(mongoEval(PLANT_LEGACY_COOKS));
  Object.values(planted as Record<string, PlantedCook>).forEach(({ series, cook }) => {
    expect(series, 'the legacy cooks must have been planted').toMatch(/^[a-f0-9]{24}$/);
    expect(cook, 'the legacy cooks must have been planted').toMatch(/^[a-f0-9]{24}$/);
  });
  return planted;
};

/**
 * The peak this cook is stamped with, and whether it has been searched for —
 * read from the store because it is the cook's own record, where
 * `GET /stats` serves one number for the whole archive and some other
 * journey's cook may be the hotter one.
 */
const peakStampOf = (cookId: string) =>
  `const cook = db.smokes.findOne({ _id: ObjectId('${cookId}') }); print(cook.peakChamber + ' ' + cook.peakChamberScanned);`;

/**
 * The start this cook is stamped with, or `none` where it carries none — read
 * from the store rather than from the timeline, which derives a start for a
 * cook that was never stamped with one.
 */
const startStampOf = (cookId: string) =>
  `const cook = db.smokes.findOne({ _id: ObjectId('${cookId}') }); print(cook.startedAt ? cook.startedAt.toISOString() : 'none');`;

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
 * The repair of the cooks already in the database, proved against three: the
 * one it restores, and the two whose orphaned readings it refuses.
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
  const { unstamped, misclocked, quiet } = plantLegacyCooks();
  const { series: unstampedSeries, cook: unstampedCook } = unstamped;

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

    // The misclocked cook, reached by the same boot, is left exactly as it was.
    // Its orphaned reading is dated hours after it finished, so it is no fact
    // about the cook: stamping the cook as beginning there would bound its
    // series read below at that moment and above at its own finish, a window
    // with nothing inside it.
    expect(chambersOf(await backend.get(`/api/temps/${misclocked.series}`))).toEqual(
      MISCLOCKED.tail.map(String)
    );
    expect(mongoEval(startStampOf(misclocked.cook))).toBe('none');
    expect(mongoEval(peakStampOf(misclocked.cook))).toBe(`${MISCLOCKED.stalePeak} true`);
    // And the reading is left an orphan rather than stamped into the series
    // with the stamps held back, because holding the stamps back is not enough:
    // the timeline derives the peak it reports from every row carrying the
    // series id, clipped to no window at all. Stamped, this cook would be
    // reported at 460°F above a chart whose two points are 234 and 242.
    expect(mongoEval(seriesOf(misclocked.series))).toBe(MISCLOCKED.tail.join(','));
    const misclockedTimeline = await backend.get<Timeline>(`/api/timeline/${misclocked.cook}`);
    expect(misclockedTimeline.peakChamber).toBe(MISCLOCKED.stalePeak);

    // The quiet cook, the same refusal from the other side: its orphaned
    // reading is dated two hours before the readings its healed window was cut
    // from, so the silence between them says it belongs to another session.
    // Folded in, it would stretch the cook's recorded window across those two
    // hours and hand it a peak of 470°F.
    expect(chambersOf(await backend.get(`/api/temps/${quiet.series}`))).toEqual(
      QUIET.tail.map(String)
    );
    expect(mongoEval(seriesOf(quiet.series))).toBe(QUIET.tail.join(','));
    expect(mongoEval(startStampOf(quiet.cook))).toBe(minutesIn(420));
    expect(mongoEval(peakStampOf(quiet.cook))).toBe(`${QUIET.stalePeak} true`);
    const quietTimeline = await backend.get<Timeline>(`/api/timeline/${quiet.cook}`);
    expect(quietTimeline.durationMs).toBe(60_000);
    expect(quietTimeline.peakChamber).toBe(QUIET.stalePeak);

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
  const { series, cook: cookId } = plantLegacyCooks().stamped;

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
