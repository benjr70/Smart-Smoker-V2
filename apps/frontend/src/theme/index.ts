// The design typeface, bundled rather than fetched: the smoker is reachable
// over a tailnet and may have no route to a font CDN. Only the latin subset and
// the weights the interface actually uses are pulled in.
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';

import { createAppTheme } from './appTheme';

export { DesignSurface } from './DesignSurface';
export {
  createAppTheme,
  createThemeFromTokens,
  resolveDesignPalette,
  withDesignPalette,
} from './appTheme';
export type { DesignPalette } from './appTheme';
export { ACCENT_TINT_ALPHA, carbonLight, paletteTokens } from './tokens';
export type { PaletteTokens, ThemeMode } from './tokens';

/** The single theme the application provides to its component tree. */
export const appTheme = createAppTheme('light');
