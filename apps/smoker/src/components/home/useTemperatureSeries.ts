import { useEffect, useMemo, useRef, useState } from 'react';
import { useSmokeSession } from 'smoke-session/src/react';
import { BatchTempDto } from 'smoke-session/src/wire/types';
import {
  ChartSample,
  DEFAULT_MAX_POINTS,
  UNREPORTED,
  decimate,
} from 'temperaturechart/src/chartGeometry';

/** Nothing recorded yet, as one array, so an empty cook is always the same one. */
const NOTHING_RECORDED: ChartSample[] = [];

/**
 * How many readings the cook so far is held at before it is compacted down to
 * the plot's own size.
 *
 * A smoke runs for twelve hours at a reading every few seconds, which is tens of
 * thousands of them; keeping every one would mean this appliance holding more of
 * them, and copying and thinning more of them on each new arrival, the longer
 * the cook goes on — worst late in a long smoke, on the 800MHz panel least able
 * to absorb it. So what is kept is compacted instead, and both the memory and
 * the work per reading settle at a few plots' worth. A few, rather than one, so
 * the recent hours stay at the resolution they were read at rather than being
 * averaged again on the heels of every reading.
 */
const RETAINED_READINGS = DEFAULT_MAX_POINTS * 4;

/** A temperature off the device, as a number the chart can plot. */
const readingOf = (temp: string): number => {
  const value = parseFloat(temp);
  return Number.isFinite(value) ? value : UNREPORTED;
};

/** When a reading was taken, however the session is carrying that. */
const momentOf = (date: Date): number => new Date(date).getTime();

/**
 * The series the touchscreen's chart draws: the cook so far, as the smoker is
 * recording it.
 *
 * The hook reads the live session — the same stream the readouts beside the
 * chart are painted from — and keeps every reading that arrives while the smoke
 * is running. A reading is kept whenever it carries a moment of its own: a cook
 * run with one probe in the meat is a cook, and the chart at the smoker is
 * where the operator watches it.
 *
 * The web application keeps a hook of its own that records to the same rules
 * (`apps/frontend/src/components/smoke/smokeStep/useTemperatureSeries.ts`),
 * which is the PRD's decision: each application owns a thin series hook over
 * its own temperature stream, and neither package changes shape to hold one.
 * The two are the same code over the same session snapshot, so a change here
 * belongs there too — and a third consumer wanting the same recording is the
 * moment to lift it into the session package rather than write it a third
 * time.
 */
export function useTemperatureSeries(): ChartSample[] {
  const { chamberTemp, probeTemp1, probeTemp2, probeTemp3, date, smoking, initialTemps } =
    useSmokeSession();
  const [recorded, setRecorded] = useState<ChartSample[]>(NOTHING_RECORDED);
  const [baseline, setBaseline] = useState<BatchTempDto[]>(initialTemps);

  /**
   * The moment last taken down, so that a render caused by something other than
   * a reading — a name announced from a phone, the smoking flag flipping — does
   * not enter the reading already on screen a second time.
   */
  const lastMoment = useRef<number>(momentOf(date));

  /**
   * A new baseline means the stored cook has been re-read — the operator has
   * come back from the wifi screen, or the smoke was cleared from a phone — and
   * it already holds what this hook took down while it was away. What is held
   * here is dropped rather than drawn on top of it.
   *
   * This is settled here, while rendering, and not in an effect afterwards: an
   * effect would let the render that first sees the re-read cook draw it with
   * the superseded readings still on the end, and a cook that doubles back on
   * itself for a frame is a line that visibly folds over.
   */
  const sameCook = baseline === initialTemps;
  if (!sameCook) {
    setBaseline(initialTemps);
    setRecorded(NOTHING_RECORDED);
  }
  const cook = sameCook ? recorded : NOTHING_RECORDED;

  useEffect(() => {
    if (!smoking) return;
    const moment = momentOf(date);
    if (!Number.isFinite(moment) || moment === lastMoment.current) return;
    lastMoment.current = moment;
    setRecorded(recorded => [
      ...(recorded.length < RETAINED_READINGS ? recorded : decimate(recorded)),
      {
        ChamberTemp: readingOf(chamberTemp),
        MeatTemp: readingOf(probeTemp1),
        Meat2Temp: readingOf(probeTemp2),
        Meat3Temp: readingOf(probeTemp3),
        date,
      },
    ]);
  }, [chamberTemp, probeTemp1, probeTemp2, probeTemp3, date, smoking]);

  /**
   * The cook that was already stored when the screen came up, thinned the once.
   * A panel switched on late into a long smoke is handed every reading the
   * backend has kept for it, and none of them will ever change again, so they
   * are thinned when they arrive rather than on the heels of every new reading.
   */
  const alreadyCooked = useMemo(() => decimate(initialTemps), [initialTemps]);

  /**
   * The cook the chart is handed: what was already stored when the screen came
   * up, then everything the device has read since, thinned to what the plot can
   * show. A cook runs for twelve hours at a reading every few seconds, and the
   * chart must not carry a path segment for every one of them — so the thinning
   * happens here, once per reading, rather than inside the drawing.
   *
   * It is rebuilt only when one of those two changes, so a render caused by
   * anything else — a name announced from a phone — hands the chart back the
   * identical array and costs the kiosk no redrawing.
   */
  return useMemo(() => decimate([...alreadyCooked, ...cook]), [alreadyCooked, cook]);
}
