/**
 * The design's colour tokens, one named set per palette.
 *
 * A palette is nothing but a `PaletteTokens` value; the theme factory turns any
 * such set into a Material-UI theme. Adding the deferred dark palette therefore
 * means adding a second constant here and a second entry in `paletteTokens` —
 * no theme restructuring.
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

/** Carbon light — the only palette that ships today. */
export const carbonLight: PaletteTokens = {
  background: '#F6F6F5',
  surface: '#FFFFFF',
  surfaceAlt: '#ECECEA',
  border: '#E2E2DF',
  inputBorder: '#D2D2CE',
  text: '#121212',
  textSecondary: '#6B6B68',
  accent: '#DA4A2E',
  danger: '#B91C1C',
  success: '#3F7D46',
};

/** The palette modes the application can render in. */
export type ThemeMode = 'light';

/** Every shipped palette, keyed by the mode that selects it. */
export const paletteTokens: Record<ThemeMode, PaletteTokens> = {
  light: carbonLight,
};
