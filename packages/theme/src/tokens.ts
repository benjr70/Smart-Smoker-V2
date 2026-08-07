/**
 * The design's colour tokens, one named set per palette.
 *
 * A palette is nothing but a `PaletteTokens` value; the theme adapter turns any
 * such set into a Material-UI colour scheme. A further palette is therefore a
 * further constant here and a further entry in `paletteTokens` — no theme
 * restructuring, and nothing in this file knows what a component library is.
 */
/**
 * The four temperature readings, each in its own colour, so a name and the
 * number beside it identify the probe they belong to at a glance.
 *
 * A palette carries its own set because the colours have to be read against that
 * palette's surfaces: the light set is dark ink on a white card, and reusing it
 * on a near-black one would leave the two darkest readings all but invisible.
 * Hue is what carries the identity, so the dark set keeps each probe's hue and
 * moves only its lightness.
 */
export interface ProbeTokens {
  chamber: string;
  probe1: string;
  probe2: string;
  probe3: string;
}

/**
 * Everything the temperature chart paints with, for one palette.
 *
 * The chart draws itself out of raw colour rather than out of components, so it
 * cannot inherit a surface the way a card does: it has to be handed the panel it
 * sits on, the two weights of framing around the plot, and a colour per reading.
 *
 * These are chart lines, read against that panel — a different job from the
 * `probes` colours, which are the readings text on a card, and a different set of
 * values.
 */
export interface ChartTokens {
  /** The panel the plot is drawn on. */
  panel: string;
  /** The dashed gridlines behind the data. */
  grid: string;
  /** The axis labels beside it. */
  label: string;
  /** The chamber's line. */
  chamber: string;
  /** The first meat probe's line. */
  probe1: string;
  /** The second meat probe's line. */
  probe2: string;
  /** The third meat probe's line. */
  probe3: string;
}

export interface PaletteTokens {
  /** Page background behind every surface. */
  background: string;
  /** Default card / sheet surface. */
  surface: string;
  /** Alternate surface for rows nested inside a card. */
  surfaceAlt: string;
  /** Hairline around surfaces. */
  border: string;
  /** Hairline around form controls. */
  inputBorder: string;
  /** The navigation bar's own surface, at the edge of the app. */
  navigation: string;
  /** Primary text. */
  text: string;
  /** Secondary / supporting text. */
  textSecondary: string;
  /** Brand accent, used for primary actions. */
  accent: string;
  /** Destructive / error. */
  danger: string;
  /** Positive / success. */
  success: string;
  /** One colour per temperature probe. */
  probes: ProbeTokens;
  /** The temperature chart's own colours. */
  chart: ChartTokens;
}

/** Alpha applied to the accent for accent-tinted backgrounds. */
export const ACCENT_TINT_ALPHA = 0.12;

/** Carbon light, for a lit room and a phone in daylight. */
export const carbonLight: PaletteTokens = {
  background: '#F6F6F5',
  surface: '#FFFFFF',
  surfaceAlt: '#ECECEA',
  border: '#E2E2DF',
  inputBorder: '#D2D2CE',
  navigation: '#FFFFFF',
  text: '#121212',
  textSecondary: '#6B6B68',
  accent: '#DA4A2E',
  danger: '#B91C1C',
  success: '#3F7D46',
  // The colours the temperature chart has always drawn its lines in, so a
  // reading and the line it belongs to still match on a light card.
  probes: {
    chamber: '#1f4f2d',
    probe1: '#2a475e',
    probe2: '#118cd8',
    probe3: '#5582a7',
  },
  // The chart is a white panel among white cards, framed in the same hairline
  // and the same secondary ink as everything else on the page. Its four lines
  // are the design's own: the brand accent for the chamber, then a green, a blue
  // and a violet, spread far enough around the wheel to be told apart at a
  // glance on a phone held at arm's length over a smoker.
  chart: {
    panel: '#FFFFFF',
    grid: '#E2E2DF',
    label: '#6B6B68',
    chamber: '#DA4A2E',
    probe1: '#3F7D46',
    probe2: '#2A6FB8',
    probe3: '#7C5AC8',
  },
};

/**
 * Carbon dark. The accent deliberately differs from the light set rather than
 * being reused: the light accent is not legible against a near-black surface.
 */
export const carbonDark: PaletteTokens = {
  background: '#0C0C0C',
  surface: '#161616',
  surfaceAlt: '#202020',
  border: '#2C2C2C',
  inputBorder: '#3A3A3A',
  navigation: '#111111',
  text: '#F0EFED',
  textSecondary: '#8E8E8A',
  accent: '#FF6247',
  danger: '#F0503C',
  success: '#4EA85C',
  // Each probe's own hue, lifted until it reads against a near-black surface:
  // the chamber's green and the third probe's steel keep their identity, and the
  // second probe stays the most vivid of the three blues, as it is in the light.
  probes: {
    chamber: '#4FBF6A',
    probe1: '#7FA9C9',
    probe2: '#4FB5FF',
    probe3: '#A8C4DB',
  },
  // The same four hues, lifted until each line carries on a near-black panel:
  // the plot sits on the card colour, and the frame keeps the light scheme's
  // relationship, with the grid far quieter than the labels beside it.
  chart: {
    panel: '#161616',
    grid: '#2C2C2C',
    label: '#8E8E8A',
    chamber: '#FF6247',
    probe1: '#5BC46E',
    probe2: '#4E9BE8',
    probe3: '#A585F0',
  },
};

/** The palette modes the application can render in. */
export type ThemeMode = 'light' | 'dark';

/** Every shipped palette, keyed by the mode that selects it. */
export const paletteTokens: Record<ThemeMode, PaletteTokens> = {
  light: carbonLight,
  dark: carbonDark,
};
