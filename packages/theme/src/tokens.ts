/**
 * The design's colour tokens, one named set per palette.
 *
 * A palette is nothing but a `PaletteTokens` value; the theme adapter turns any
 * such set into a Material-UI colour scheme. A further palette is therefore a
 * further constant here and a further entry in `paletteTokens` — no theme
 * restructuring, and nothing in this file knows what a component library is.
 */
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
};

/** The palette modes the application can render in. */
export type ThemeMode = 'light' | 'dark';

/** Every shipped palette, keyed by the mode that selects it. */
export const paletteTokens: Record<ThemeMode, PaletteTokens> = {
  light: carbonLight,
  dark: carbonDark,
};
