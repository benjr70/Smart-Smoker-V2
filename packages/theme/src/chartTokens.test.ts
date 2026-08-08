/**
 * The temperature chart is the one surface that paints itself entirely from
 * colour rather than from Material-UI components, so it needs its own colours in
 * the tokens: the panel it is drawn on, the gridlines and labels that frame it,
 * and one colour per reading it plots.
 *
 * These are chart furniture, not the readings text the `probes` tokens colour,
 * and they are read against the chart's own panel rather than against a card —
 * which is what the assertions below hold each palette to.
 */
import { ChartTokens, PaletteTokens, carbonDark, carbonLight } from './tokens';

/** A hex colour's relative luminance, per WCAG 2. */
const luminance = (hex: string): number => {
  const channels = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255);
  const [r, g, b] = channels.map(channel =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The WCAG contrast ratio between two hex colours. */
const contrast = (one: string, other: string): number => {
  const [lighter, darker] = [luminance(one), luminance(other)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};

/** A hex colour's hue in degrees, which is what carries a reading's identity. */
const hue = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const span = max - Math.min(r, g, b);
  if (span === 0) return 0;
  const raw =
    max === r ? ((g - b) / span) % 6 : max === g ? (b - r) / span + 2 : (r - g) / span + 4;
  return (60 * raw + 360) % 360;
};

/** The threshold a line drawn on the panel has to clear to be seen at all. */
const VISIBLE_LINE = 3;

const seriesOf = (chart: ChartTokens): [string, string][] => [
  ['the chamber', chart.chamber],
  ['the first probe', chart.probe1],
  ['the second probe', chart.probe2],
  ['the third probe', chart.probe3],
];

const palettes: [string, PaletteTokens][] = [
  ['the light scheme', carbonLight],
  ['the dark scheme', carbonDark],
];

describe.each(palettes)('%s chart tokens', (_scheme, tokens) => {
  it('carries a panel, gridline and label colour plus one per reading', () => {
    expect(tokens.chart).toEqual({
      panel: expect.stringMatching(/^#[0-9A-F]{6}$/i),
      grid: expect.stringMatching(/^#[0-9A-F]{6}$/i),
      label: expect.stringMatching(/^#[0-9A-F]{6}$/i),
      chamber: expect.stringMatching(/^#[0-9A-F]{6}$/i),
      probe1: expect.stringMatching(/^#[0-9A-F]{6}$/i),
      probe2: expect.stringMatching(/^#[0-9A-F]{6}$/i),
      probe3: expect.stringMatching(/^#[0-9A-F]{6}$/i),
    });
  });

  /** Four lines on one plot are only readable if no two of them share a colour. */
  it('draws each of the four readings in a colour of its own', () => {
    const series = seriesOf(tokens.chart).map(([, colour]) => colour.toUpperCase());

    expect(new Set(series).size).toBe(series.length);
  });

  it.each(seriesOf(tokens.chart))('shows %s against its own chart panel', (_name, colour) => {
    expect(contrast(colour, tokens.chart.panel)).toBeGreaterThanOrEqual(VISIBLE_LINE);
  });

  /**
   * Gridlines sit behind the data and axis labels sit beside it, so the grid has
   * to be the quieter of the two against the panel — otherwise the frame reads
   * louder than the cook.
   */
  it('keeps its gridlines quieter than its axis labels', () => {
    const { grid, label, panel } = tokens.chart;

    expect(contrast(grid, panel)).toBeLessThan(contrast(label, panel));
    expect(contrast(label, panel)).toBeGreaterThanOrEqual(VISIBLE_LINE);
  });
});

/**
 * The dark set is the light set lifted off a near-black panel, not a second
 * arbitrary palette: a reading keeps the hue it has in daylight so that the same
 * line means the same probe in either scheme.
 */
describe('the two chart palettes together', () => {
  const pairs = seriesOf(carbonLight.chart).map(
    ([name, colour], at) => [name, colour, seriesOf(carbonDark.chart)[at][1]] as const
  );

  it.each(pairs)('keeps the hue of %s across the two schemes', (_name, light, dark) => {
    const drift = Math.abs(hue(light) - hue(dark));

    expect(Math.min(drift, 360 - drift)).toBeLessThanOrEqual(15);
  });

  it('draws each scheme on its own panel rather than sharing one', () => {
    expect(carbonLight.chart.panel).not.toBe(carbonDark.chart.panel);
  });
});
