import { ChartSeriesNames } from 'temperaturechart/src/TemperatureChart';

/**
 * What each line is called when nobody has named it.
 *
 * A cook is often started without naming anything, and a legend reading "Probe
 * 2" is still a legend; a blank one is not.
 */
export const DEFAULT_SERIES_NAMES: ChartSeriesNames = {
  chamber: 'Chamber',
  probe1: 'Probe 1',
  probe2: 'Probe 2',
  probe3: 'Probe 3',
};

/** Anything carrying the four probe names, live or stored. */
export interface NamedProbes {
  chamberName?: string;
  probe1Name?: string;
  probe2Name?: string;
  probe3Name?: string;
}

/**
 * The names the chart labels its lines with, in the legend and under a finger.
 *
 * The live session and a stored smoke profile carry the same four fields and
 * both may carry them empty — the session because a name was cleared, a stored
 * smoke because it was never named — so the fallback is decided in one place
 * rather than at each chart.
 *
 * The touchscreen decides the same thing for its own chart, in its own copy of
 * this (`apps/smoker/src/components/home/home.tsx`), because neither
 * application imports the other's screens. The two do the same thing with a
 * name and differ only in what they fall back to — the kiosk falls back to the
 * session's default names, which are the ones its readouts show — so a change
 * to what happens to a name belongs in both.
 */
export const chartNamesOf = (named: NamedProbes): ChartSeriesNames => ({
  chamber: named.chamberName?.trim() || DEFAULT_SERIES_NAMES.chamber,
  probe1: named.probe1Name?.trim() || DEFAULT_SERIES_NAMES.probe1,
  probe2: named.probe2Name?.trim() || DEFAULT_SERIES_NAMES.probe2,
  probe3: named.probe3Name?.trim() || DEFAULT_SERIES_NAMES.probe3,
});
