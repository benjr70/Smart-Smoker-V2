/**
 * Reading back what the temperature chart actually painted.
 *
 * The chart is a drawing, not a document: its panel, its four lines, its grid,
 * its labels and its cook-log markers are SVG shapes carrying colours and
 * letters as attributes. Nothing in it has a role, a label or a name to be
 * asked for by, so a test that wants to know what colour this device's chart
 * came out — the one question the recolour exists to answer — has to look at
 * the shapes.
 *
 * Those looks live here rather than in each test, for the reason the CSS
 * readers next door do (`theme/testing/deviceColours.ts`): they are a reader of
 * a rendering, shared by every screen that draws one, and a test is a clearer
 * statement of intent when it says "the lines came out in these colours" than
 * when it says how it went and found them. The chart hangs `data-` attributes
 * on the shapes it draws precisely so they can be found this way.
 */

/** The plot itself, as it stands in the document — `null` when none is drawn. */
export const chartPlot = (): Element | null =>
  document.querySelector('svg[aria-label="Temperature chart"]');

/** The panel the plot is drawn on: the first thing the chart paints. */
export const chartPanelFill = (): string | null =>
  chartPlot()?.querySelector('rect')?.getAttribute('fill') ?? null;

/** The four lines the chart draws, in the order it draws them. */
export const seriesStrokes = (): (string | null)[] =>
  Array.from(document.querySelectorAll('path[data-series]')).map(line =>
    line.getAttribute('stroke')
  );

/** The colour the chart rules its gridlines in. */
export const gridStroke = (): string | null =>
  document.querySelector('line[data-grid]')?.getAttribute('stroke') ?? null;

/** The colour the chart writes its temperature labels in. */
export const tempLabelFill = (): string | null =>
  document.querySelector('text[data-temp-label]')?.getAttribute('fill') ?? null;

/**
 * The letter in each cook-log bubble, left to right — one per event the chart
 * was handed and could place in the window it is drawing.
 */
export const markerLetters = (): string[] =>
  Array.from(document.querySelectorAll('text[data-event-letter]')).map(
    letter => letter.textContent ?? ''
  );
