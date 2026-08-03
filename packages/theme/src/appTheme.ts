import {
  Theme,
  alpha,
  createTheme,
  experimental_extendTheme as extendTheme,
} from '@mui/material/styles';
import type { CssVarsTheme } from '@mui/material/styles';
import { ACCENT_TINT_ALPHA, PaletteTokens, ThemeMode, carbonLight, paletteTokens } from './tokens';

/**
 * The design's tokens as the application carries them: the token set itself plus
 * the values derived from it. Every theme the application provides carries one,
 * so any screen can reach the design's colours — but only a screen that has been
 * restyled actually paints itself with them (see `DesignSurface`).
 */
export interface DesignPalette extends PaletteTokens {
  /** The accent at the design's tint alpha, for accent-tinted backgrounds. */
  accentTint: string;
  /** The design typeface, ahead of the fallbacks that cover the first frame. */
  fontFamily: string;
}

declare module '@mui/material/styles' {
  interface Theme {
    design: DesignPalette;
  }
  interface ThemeOptions {
    design?: DesignPalette;
  }
  /** The tokens each colour scheme of the application theme carries. */
  interface ColorSystem {
    design: DesignPalette;
  }
  interface ColorSystemOptions {
    design?: DesignPalette;
  }
}

/**
 * The design typeface. The faces themselves are pulled into the bundle by
 * `./index.ts`; the fallbacks here cover the frame before the webfont paints.
 */
const FONT_FAMILY = ['"Plus Jakarta Sans"', '"Helvetica Neue"', 'Arial', 'sans-serif'].join(', ');

/** Everything a token set implies, resolved once. */
export const resolveDesignPalette = (tokens: PaletteTokens): DesignPalette => ({
  ...tokens,
  accentTint: alpha(tokens.accent, ACCENT_TINT_ALPHA),
  fontFamily: FONT_FAMILY,
});

/**
 * An application theme from an arbitrary token set, so a further palette is data
 * rather than code.
 *
 * The theme deliberately leaves Material-UI's own palette and typography as they
 * are: it carries the tokens, and a consumer decides where they are painted by
 * wrapping that part of its tree in a `DesignSurface`. An application still
 * painting itself by hand — the touchscreen, until the slice that recolours it —
 * can therefore take this theme without being repainted or re-typed by it.
 */
export const createThemeFromTokens = (mode: 'light' | 'dark', tokens: PaletteTokens): Theme =>
  createTheme({ palette: { mode }, design: resolveDesignPalette(tokens) });

/** The application theme for a shipped palette mode. */
export const createAppTheme = (mode: ThemeMode): Theme =>
  createThemeFromTokens(mode, paletteTokens[mode]);

/**
 * The theme the application root provides: one theme carrying every palette as
 * a colour scheme.
 *
 * Which scheme paints is decided by the colour-scheme provider, which puts the
 * scheme on the document and emits each scheme's tokens as custom properties —
 * so nothing has to swap a theme object to change how the application looks.
 * A further palette is a further entry in `tokens`.
 */
export const createColorSchemeTheme = (
  tokens: Record<ThemeMode, PaletteTokens> = paletteTokens
): CssVarsTheme =>
  extendTheme({
    colorSchemes: {
      light: { design: resolveDesignPalette(tokens.light) },
      dark: { design: resolveDesignPalette(tokens.dark) },
    },
  });

/**
 * The theme without the custom properties a colour-scheme theme carries.
 *
 * Material-UI's components read their colours from those properties in
 * preference to the palette, and the properties hold Material-UI's own palette
 * rather than the design's. A restyled subtree is painted from the values the
 * scheme in effect resolved to, so it is handed a theme that has none.
 */
const withoutCustomProperties = (theme: Theme): Theme => {
  const plain = { ...theme } as Theme & Partial<Pick<CssVarsTheme, 'vars' | 'colorSchemes'>>;
  delete plain.vars;
  delete plain.colorSchemes;
  return plain;
};

/**
 * The enclosing theme, repainted and re-typed in the design's tokens.
 *
 * Applied by `DesignSurface` to the theme already in scope, so a restyled
 * subtree keeps everything the application theme gave it and changes only what
 * the design describes. The palette and typography are derived first
 * so that the shades Material-UI computes for itself — a contained button's
 * hover, a control's contrast text, each type variant's family — come from the
 * design's colours rather than from the ones being replaced.
 */
export const withDesignPalette = (outer: Theme): Theme => {
  // A restyled screen has to look right wherever it is mounted, including under
  // a theme built by a bare `createTheme()`, which carries no design palette.
  const design = outer.design ?? resolveDesignPalette(carbonLight);

  const painted = createTheme({
    typography: { fontFamily: design.fontFamily },
    palette: {
      mode: outer.palette.mode,
      background: { default: design.background, paper: design.surface },
      divider: design.border,
      text: { primary: design.text, secondary: design.textSecondary },
      primary: { main: design.accent },
      error: { main: design.danger },
      success: { main: design.success },
    },
  });

  return createTheme(withoutCustomProperties(outer), {
    // The subtree carries the tokens it was painted with, so a restyled screen
    // can reach the ones the palette has no room for — the alternate surface, the
    // accent tint — however the theme around it was built.
    design,
    typography: painted.typography,
    palette: painted.palette,
    // Deliberately no `shape` override: `shape.borderRadius` reaches MuiButton
    // and MuiOutlinedInput, whose radii the design specifies per control rather
    // than globally. The card radius the design asks for is set on MuiCard
    // alone.
    components: {
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundColor: design.surface,
            border: `1px solid ${design.border}`,
            borderRadius: 16,
            boxShadow: 'none',
            backgroundImage: 'none',
          },
        },
      },
    },
  });
};
