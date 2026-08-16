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
  /**
   * The fill behind a form control, as the design derives it:
   * `inputBg: dark ? alt : bg`.
   *
   * What makes a field a field in this design is the 1.5px `inputBorder` drawn
   * around it, not a fill that contrasts with whatever is behind it — the
   * design's history header deliberately puts a page-toned field on a page-toned
   * header and lets the hairline do the work. So the fill only has to stay off
   * the card a field usually sits on, which is the #517 defect: the light
   * palette takes the page tone, and the dark one, where the page is darker than
   * the card, takes the alternate surface. Derived from the palette rather than
   * named by it, so a further palette gets its fields right by declaring which
   * mode it is.
   */
  inputBg: string;
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

/** Everything a token set implies, resolved once for the mode it paints in. */
export const resolveDesignPalette = (tokens: PaletteTokens, mode: ThemeMode): DesignPalette => ({
  ...tokens,
  accentTint: alpha(tokens.accent, ACCENT_TINT_ALPHA),
  inputBg: mode === 'dark' ? tokens.surfaceAlt : tokens.background,
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
  createTheme({ palette: { mode }, design: resolveDesignPalette(tokens, mode) });

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
      light: { design: resolveDesignPalette(tokens.light, 'light') },
      dark: { design: resolveDesignPalette(tokens.dark, 'dark') },
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
  const design = outer.design ?? resolveDesignPalette(carbonLight, 'light');

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
      // Every form control is filled and outlined, the design's way round:
      // Material-UI's controls are transparent and so take the colour of
      // whatever they are dropped onto, which is the card they sit on. Set on
      // the input base every control is built from — outlined, filled, standard
      // and bare alike — so a field is right wherever one is added, in whatever
      // variant.
      //
      // The hairline is what makes a field a field here, and it is the whole of
      // the affordance in the light scheme, where the fill is the page tone: a
      // field in the history header or on the card-less pre-smoke form sits on
      // its own colour and is read by this border alone.
      MuiInputBase: {
        styleOverrides: {
          root: {
            backgroundColor: design.inputBg,
            border: `1.5px solid ${design.inputBorder}`,
            '&.Mui-focused': { borderColor: design.accent },
            // The outlined control draws the same hairline in the fieldset it
            // needs anyway for the notch a floating label cuts in it, so it
            // must not draw a second one around the root.
            '&.MuiOutlinedInput-root': { border: 'none' },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          // The fieldset is that control's hairline. Material-UI draws it in a
          // translucent black or white; the design names a colour per palette.
          // The focused and error widths Material-UI sets on top of this are
          // left alone, so the accent still marks the field being typed into.
          notchedOutline: { borderWidth: 1.5, borderColor: design.inputBorder },
        },
      },
      // The filled control tints itself over that base, and tints itself again
      // on hover and while focused, so all three states have to name the
      // design's fill.
      MuiFilledInput: {
        styleOverrides: {
          root: {
            backgroundColor: design.inputBg,
            '&:hover': { backgroundColor: design.inputBg },
            '&.Mui-focused': { backgroundColor: design.inputBg },
          },
        },
      },
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
