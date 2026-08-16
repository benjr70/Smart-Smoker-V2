import { createTheme } from '@mui/material/styles';
import { createAppTheme, createThemeFromTokens, withDesignPalette } from './appTheme';
import { PaletteTokens, carbonLight } from './tokens';

/**
 * AC 1: the design's Carbon light tokens, defined once and carried by the
 * application theme. Every screen can reach them; a screen paints itself with
 * them by opting in (AC 6 keeps Smoke, History and the bottom navigation out).
 */
describe('the application theme — the Carbon light tokens it carries', () => {
  it('carries the page background and the surface colours', () => {
    const { design } = createAppTheme('light');

    expect(design.background).toBe('#F6F6F5');
    expect(design.surface).toBe('#FFFFFF');
    expect(design.surfaceAlt).toBe('#ECECEA');
  });

  it('carries the hairline and text colours', () => {
    const { design } = createAppTheme('light');

    expect(design.border).toBe('#E2E2DF');
    expect(design.inputBorder).toBe('#D2D2CE');
    expect(design.text).toBe('#121212');
    expect(design.textSecondary).toBe('#6B6B68');
  });

  /**
   * The design fills a form control with the page background in the light
   * scheme and with the alternate surface in the dark one, so that a field
   * always reads as a well cut into the card it sits on rather than as part of
   * it. The colour is therefore derived from the palette in effect rather than
   * being a further colour a palette has to name.
   */
  it('fills form controls with the page background in the light palette', () => {
    const { design } = createAppTheme('light');

    expect(design.inputBg).toBe(design.background);
    expect(design.inputBg).toBe('#F6F6F5');
  });

  it('fills them with the alternate surface in the dark palette', () => {
    const { design } = createAppTheme('dark');

    expect(design.inputBg).toBe(design.surfaceAlt);
    expect(design.inputBg).toBe('#202020');
  });

  it('carries the accent, danger and success colours', () => {
    const { design } = createAppTheme('light');

    expect(design.accent).toBe('#DA4A2E');
    expect(design.danger).toBe('#B91C1C');
    expect(design.success).toBe('#3F7D46');
  });

  it('tints accent backgrounds at 12% of the accent colour', () => {
    expect(createAppTheme('light').design.accentTint).toBe('rgba(218, 74, 46, 0.12)');
  });

  it('names the design typeface ahead of the system fallbacks', () => {
    const { design } = createAppTheme('light');

    expect(design.fontFamily).toMatch(/^"Plus Jakarta Sans"/);
    // A fallback still has to exist for the moment before the webfont paints.
    expect(design.fontFamily).toMatch(/sans-serif$/);
  });

  /**
   * AC 6, at the theme level: the application theme is provided at the root, so
   * carrying the tokens must not amount to applying them. The rendered proof is
   * in `unrestyledScreens.test.tsx`; this states the intent.
   */
  it('paints nothing with them, leaving Material-UI’s own palette and typeface', () => {
    const theme = createAppTheme('light');
    const untouched = createTheme();

    expect(theme.palette.primary.main).toBe(untouched.palette.primary.main);
    expect(theme.palette.text.primary).toBe(untouched.palette.text.primary);
    expect(theme.palette.background.default).toBe(untouched.palette.background.default);
    expect(theme.typography.fontFamily).toBe(untouched.typography.fontFamily);
  });
});

/**
 * The design palette as a screen that has opted in sees it — the shape the
 * settings page is rendered in, and the shape the remaining screens will take as
 * they are restyled.
 */
describe('the design palette, where a screen opts into it', () => {
  const opted = () => withDesignPalette(createAppTheme('light'));

  it('paints surfaces, hairlines and text in the design colours', () => {
    const theme = opted();

    expect(theme.palette.background.default).toBe('#F6F6F5');
    expect(theme.palette.background.paper).toBe('#FFFFFF');
    expect(theme.palette.divider).toBe('#E2E2DF');
    expect(theme.palette.text.primary).toBe('#121212');
    expect(theme.palette.text.secondary).toBe('#6B6B68');
  });

  it('uses the design accent for primary actions, plus the danger and success colours', () => {
    const theme = opted();

    expect(theme.palette.primary.main).toBe('#DA4A2E');
    expect(theme.palette.error.main).toBe('#B91C1C');
    expect(theme.palette.success.main).toBe('#3F7D46');
  });

  it('derives the shades Material-UI computes for itself from the accent', () => {
    // A contained button's hover reads `primary.dark`; leaving it behind would
    // paint the accent button's hover in Material-UI's blue.
    const theme = opted();

    expect(theme.palette.primary.dark).not.toBe(createTheme().palette.primary.dark);
    expect(theme.palette.primary.contrastText).toBe(
      createTheme({ palette: { primary: { main: '#DA4A2E' } } }).palette.primary.contrastText
    );
  });

  it('types every variant in the design typeface, not only the base', () => {
    const theme = opted();

    expect(theme.typography.fontFamily).toMatch(/^"Plus Jakarta Sans"/);
    expect(theme.typography.h4.fontFamily).toMatch(/^"Plus Jakarta Sans"/);
    expect(theme.typography.body2.fontFamily).toMatch(/^"Plus Jakarta Sans"/);
  });

  it('keeps what the enclosing application theme provided', () => {
    const marked = createTheme(createAppTheme('light'), { spacing: 9 });

    expect(withDesignPalette(marked).spacing(1)).toBe('9px');
  });

  it('still paints the design when mounted under a theme that carries no tokens', () => {
    const theme = withDesignPalette(createTheme());

    expect(theme.palette.primary.main).toBe('#DA4A2E');
    expect(theme.palette.background.default).toBe('#F6F6F5');
  });

  /**
   * A restyled screen reaches for tokens the palette does not carry — the
   * alternate surface a segmented control sits on, the accent tint — so the
   * subtree has to carry the token set it was painted with, whatever the theme
   * around it does or does not provide.
   */
  it('carries the tokens it painted with, even under a theme that had none', () => {
    expect(withDesignPalette(createTheme()).design).toMatchObject(carbonLight);
  });
});

/**
 * AC 7: a dark palette must be addable by supplying a second token set. That is
 * only true if both the application theme and the palette an opted-in screen
 * paints with read every colour out of the tokens they are handed, so this feeds
 * them a token set that shares no value with Carbon light and checks that the
 * whole theme moved.
 */
describe('adding a further palette', () => {
  const inverted: PaletteTokens = {
    background: '#0A0A0A',
    surface: '#161616',
    surfaceAlt: '#242424',
    border: '#333333',
    inputBorder: '#444444',
    navigation: '#050505',
    text: '#F4F4F4',
    textSecondary: '#A8A8A8',
    accent: '#FF8A65',
    danger: '#FF6B6B',
    success: '#6FCF7F',
    probes: {
      chamber: '#7FD68D',
      probe1: '#9CC0DC',
      probe2: '#6FC2FF',
      probe3: '#C2D8E8',
    },
    chart: {
      panel: '#111111',
      grid: '#2A2A2A',
      label: '#9B9B9B',
      chamber: '#FF9E80',
      probe1: '#7FD68D',
      probe2: '#6FC2FF',
      probe3: '#C39BF5',
    },
  };

  it('carries the second token set on the application theme', () => {
    const { design } = createThemeFromTokens('dark', inverted);

    expect(design).toMatchObject(inverted);
    expect(design.accentTint).toBe('rgba(255, 138, 101, 0.12)');
  });

  it('paints an opted-in screen from it without any further wiring', () => {
    const theme = withDesignPalette(createThemeFromTokens('dark', inverted));

    expect(theme.palette.mode).toBe('dark');
    expect(theme.palette.background.default).toBe('#0A0A0A');
    expect(theme.palette.background.paper).toBe('#161616');
    expect(theme.palette.divider).toBe('#333333');
    expect(theme.palette.text.primary).toBe('#F4F4F4');
    expect(theme.palette.text.secondary).toBe('#A8A8A8');
    expect(theme.palette.primary.main).toBe('#FF8A65');
    expect(theme.palette.error.main).toBe('#FF6B6B');
    expect(theme.palette.success.main).toBe('#6FCF7F');
  });
});
