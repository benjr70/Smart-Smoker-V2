import { Theme, alpha, createTheme } from '@mui/material/styles';
import { ACCENT_TINT_ALPHA, PaletteTokens, ThemeMode, paletteTokens } from './tokens';

declare module '@mui/material/styles' {
  interface Palette {
    surfaceAlt: string;
    inputBorder: string;
    accentTint: string;
  }
  interface PaletteOptions {
    surfaceAlt?: string;
    inputBorder?: string;
    accentTint?: string;
  }
}

/**
 * The design typeface. The faces themselves are pulled into the bundle by
 * `./index.ts`; the fallbacks here cover the frame before the webfont paints.
 */
const FONT_FAMILY = ['"Plus Jakarta Sans"', '"Helvetica Neue"', 'Arial', 'sans-serif'].join(', ');

/** Build a theme from an arbitrary token set, so a new palette is data, not code. */
export const createThemeFromTokens = (mode: 'light' | 'dark', tokens: PaletteTokens): Theme =>
  createTheme({
    typography: { fontFamily: FONT_FAMILY },
    palette: {
      mode,
      background: { default: tokens.background, paper: tokens.surface },
      surfaceAlt: tokens.surfaceAlt,
      inputBorder: tokens.inputBorder,
      accentTint: alpha(tokens.accent, ACCENT_TINT_ALPHA),
      divider: tokens.border,
      text: { primary: tokens.text, secondary: tokens.textSecondary },
      primary: { main: tokens.accent },
      error: { main: tokens.danger },
      success: { main: tokens.success },
    },
    // Deliberately no global `shape` override: Material-UI's default control
    // geometry is what the screens this slice does not restyle were built on,
    // and `shape.borderRadius` reaches MuiButton and MuiOutlinedInput. The card
    // radius the design asks for is set on MuiCard alone, below.
    components: {
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundColor: tokens.surface,
            border: `1px solid ${tokens.border}`,
            borderRadius: 16,
            boxShadow: 'none',
            backgroundImage: 'none',
          },
        },
      },
    },
  });

/** The application theme for a shipped palette mode. */
export const createAppTheme = (mode: ThemeMode): Theme =>
  createThemeFromTokens(mode, paletteTokens[mode]);
