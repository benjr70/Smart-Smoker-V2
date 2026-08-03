/**
 * Dark mode has to be usable, not merely dark: every colour the palettes ask for
 * text to be written in has to stay readable against every surface that text
 * actually sits on, in both schemes — and the accent, which marks primary
 * actions and active states, has to stay visible against them too.
 *
 * The measure is the WCAG contrast ratio, computed here from the tokens
 * themselves rather than from a rendered screen, because it is the palette that
 * either holds or breaks the promise. 4.5:1 is the threshold for text, 3:1 the
 * one for a control's own colour.
 */
import { PaletteTokens, carbonDark, carbonLight } from './tokens';

const READABLE_TEXT = 4.5;
/** The threshold for text set large and bold, and for a control's own colour. */
const READABLE_LARGE_TEXT = 3;

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

/** Every surface a screen puts text on. */
const surfacesOf = (tokens: PaletteTokens): [string, string][] => [
  ['the page background', tokens.background],
  ['a card', tokens.surface],
  ['a row nested in a card', tokens.surfaceAlt],
  ['the navigation bar', tokens.navigation],
];

const palettes: [string, PaletteTokens][] = [
  ['the light scheme', carbonLight],
  ['the dark scheme', carbonDark],
];

describe.each(palettes)('%s', (_scheme, tokens) => {
  it.each(surfacesOf(tokens))('reads its primary text against %s', (_surface, surface) => {
    expect(contrast(tokens.text, surface)).toBeGreaterThanOrEqual(READABLE_TEXT);
  });

  it.each(surfacesOf(tokens))('reads its secondary text against %s', (_surface, surface) => {
    expect(contrast(tokens.textSecondary, surface)).toBeGreaterThanOrEqual(READABLE_TEXT);
  });

  /**
   * The accent marks primary actions and the destination in effect, so each
   * scheme has to show its own accent against its own surfaces — which is why
   * the two schemes carry different ones rather than sharing a colour.
   */
  it.each(surfacesOf(tokens))('shows its accent against %s', (_surface, surface) => {
    expect(contrast(tokens.accent, surface)).toBeGreaterThanOrEqual(READABLE_LARGE_TEXT);
  });

  it('shows its danger and success colours against a card', () => {
    expect(contrast(tokens.danger, tokens.surface)).toBeGreaterThanOrEqual(READABLE_LARGE_TEXT);
    expect(contrast(tokens.success, tokens.surface)).toBeGreaterThanOrEqual(READABLE_LARGE_TEXT);
  });

  /**
   * Each temperature reading is named and read in the colour of its own probe.
   * Those are readings — the numbers an operator checks mid-cook — not chart
   * furniture, so they have to be legible on every surface a screen puts them
   * on. They are only ever set large and bold, which is the threshold they are
   * held to; the light set is the one the product has always shown, and it is
   * the dark half this pins down.
   */
  it.each(surfacesOf(tokens))('reads every probe colour against %s', (_surface, surface) => {
    Object.values(tokens.probes).forEach(probe =>
      expect(contrast(probe, surface)).toBeGreaterThanOrEqual(READABLE_LARGE_TEXT)
    );
  });

  /** Four readings at once: a colour that names two of them names neither. */
  it('gives each probe a colour of its own', () => {
    const probes = Object.values(tokens.probes);

    expect(new Set(probes).size).toBe(probes.length);
  });
});

/**
 * The dark probe colours are chosen here rather than inherited, so there is no
 * compatibility reason to settle for the large-text threshold: they clear the
 * one that applies to text of any size, on every surface a reading sits on.
 */
describe('the dark scheme’s probe colours', () => {
  it.each(surfacesOf(carbonDark))('read against %s at any size', (_surface, surface) => {
    Object.values(carbonDark.probes).forEach(probe =>
      expect(contrast(probe, surface)).toBeGreaterThanOrEqual(READABLE_TEXT)
    );
  });
});

/**
 * The measure has to be able to fail, or the thresholds above say nothing.
 * Painting one scheme's text onto the other scheme's card — which is exactly
 * what a screen left holding a colour of its own ends up doing — is the failure
 * they exist to catch.
 */
describe('the measure itself', () => {
  it('rejects the dark scheme’s secondary text against the light scheme’s card', () => {
    expect(contrast(carbonDark.textSecondary, carbonLight.surface)).toBeLessThan(READABLE_TEXT);
  });

  it('scores identical colours at the floor and black on white at the ceiling', () => {
    expect(contrast('#161616', '#161616')).toBeCloseTo(1);
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21);
  });
});
