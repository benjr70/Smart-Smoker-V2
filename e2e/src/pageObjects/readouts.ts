/**
 * Reading a temperature off what a readout displays.
 *
 * The smoke step's readouts show their unit — "213°F" — so the displayed text
 * is not a number and `Number()` answers `NaN` for all of it. The journeys do
 * not care about the unit; they care whether a readout is showing a temperature
 * and whether it is showing a new one. Both questions are answered here, in one
 * place, so the display can be restyled again without a journey silently
 * waiting thirty seconds for a string that will never arrive.
 */

/**
 * A reading as a readout can display it: the number, optionally followed by its
 * unit, and nothing else.
 *
 * The unit is optional rather than required because what this parses is a
 * temperature, not one screen's typography — a readout that showed a bare
 * number would still be showing a temperature. What is *not* optional is that
 * the whole string is the reading: an anchored pattern is what keeps "2 1 3",
 * "undefined" and an empty cell from being read as numbers.
 */
const READING = /^(-?\d+(?:\.\d+)?)\s*(?:°\s*F)?$/;

/**
 * The temperature a readout is displaying, or `NaN` when what it displays is
 * not a temperature at all.
 */
export function temperatureOf(displayed: string): number {
  const reading = READING.exec(displayed.trim())?.[1];
  return reading === undefined ? Number.NaN : Number(reading);
}

/**
 * Whether a readout is displaying a temperature at all.
 *
 * Every readout starts at the session's `0` default and carries a real reading
 * once frames arrive, so "a number greater than zero" separates a live display
 * from both the never-updated one and one rendering something that is not a
 * temperature (an empty string, `NaN`, `undefined`).
 */
export function isTemperature(displayed: string): boolean {
  return temperatureOf(displayed) > 0;
}
