import { useEffect, useMemo, useRef, useState } from 'react';
import { useSmokeSession } from 'smoke-session/src/react';
import { ChartSample, UNREPORTED, decimate } from 'temperaturechart/src/chartGeometry';

/** A temperature off the wire, as a number the chart can plot. */
const readingOf = (temp: string): number => {
  const value = parseFloat(temp);
  return Number.isFinite(value) ? value : UNREPORTED;
};

/** When a reading was taken, however the session is carrying that. */
const momentOf = (date: Date): number => new Date(date).getTime();

/**
 * The series the live chart draws: the cook so far, as it is being recorded.
 *
 * The hook reads the live session — the same stream the readouts above the
 * chart are painted from — and keeps every reading that arrives while the smoke
 * is running. A reading is kept whenever it carries a moment of its own: a cook
 * run with one probe in the meat is a cook, and the chart it draws is the point
 * of running it.
 */
export function useTemperatureSeries(): ChartSample[] {
  const { chamberTemp, probeTemp1, probeTemp2, probeTemp3, date, smoking, initialTemps } =
    useSmokeSession();
  const [recorded, setRecorded] = useState<ChartSample[]>([]);

  /**
   * The moment last taken down, so that a render caused by something other than
   * a reading — a name typed in, the smoking flag flipping — does not enter the
   * reading already on screen a second time. It starts at whatever the session
   * was last showing, which is a reading that arrived before this chart existed.
   */
  const lastMoment = useRef<number>(momentOf(date));

  /**
   * A new baseline means a different cook — the smoke was cleared, or the
   * history was re-fetched and now already contains what was recorded here — so
   * what this hook has been keeping is dropped rather than drawn on top of it.
   */
  useEffect(() => {
    setRecorded(recorded => (recorded.length === 0 ? recorded : []));
  }, [initialTemps]);

  useEffect(() => {
    if (!smoking) return;
    const moment = momentOf(date);
    if (!Number.isFinite(moment) || moment === lastMoment.current) return;
    lastMoment.current = moment;
    setRecorded(recorded => [
      ...recorded,
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
   * The cook the chart is handed: what was already recorded when the screen was
   * opened, then everything that has arrived since, thinned to what a plot can
   * show. A cook runs for twelve hours at a reading every few seconds, and the
   * chart must not carry a path segment for every one of them — so the thinning
   * happens here, once per reading, rather than inside the drawing.
   *
   * It is rebuilt only when one of those two changes, so a render caused by
   * anything else hands the chart back the identical array and costs it no
   * redrawing.
   */
  return useMemo(() => decimate([...initialTemps, ...recorded]), [initialTemps, recorded]);
}
