import { createColorSchemeTheme } from './appTheme';

export { DesignSurface } from './DesignSurface';
export { UnrestyledScreen } from './UnrestyledScreen';
export {
  createAppTheme,
  createColorSchemeTheme,
  createThemeFromTokens,
  resolveDesignPalette,
  withDesignPalette,
  withLightColorScheme,
} from './appTheme';
export type { DesignPalette } from './appTheme';
export { resolveAppearance } from './appearance';
export type {
  AppearanceInput,
  AppearanceMode,
  AppearancePreference,
  AppearanceResolution,
  ColorScheme,
} from './appearance';
export { ACCENT_TINT_ALPHA, carbonDark, carbonLight, paletteTokens } from './tokens';
export type { PaletteTokens, ThemeMode } from './tokens';

/**
 * The single theme the application provides to its component tree, carrying
 * every palette as a colour scheme. It is provided through the colour-scheme
 * provider, which decides which of them is in effect.
 */
export const appTheme = createColorSchemeTheme();
