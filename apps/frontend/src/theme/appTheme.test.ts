import { createAppTheme, createThemeFromTokens } from './appTheme';
import { PaletteTokens } from './tokens';

describe('application theme — Carbon light palette', () => {
  it('paints the page background and card surfaces with the design colours', () => {
    const theme = createAppTheme('light');

    expect(theme.palette.background.default).toBe('#F6F6F5');
    expect(theme.palette.background.paper).toBe('#FFFFFF');
    expect(theme.palette.surfaceAlt).toBe('#ECECEA');
  });

  it('draws hairlines and text in the design colours', () => {
    const theme = createAppTheme('light');

    expect(theme.palette.divider).toBe('#E2E2DF');
    expect(theme.palette.inputBorder).toBe('#D2D2CE');
    expect(theme.palette.text.primary).toBe('#121212');
    expect(theme.palette.text.secondary).toBe('#6B6B68');
  });

  it('uses the design accent for primary actions, plus the danger and success colours', () => {
    const theme = createAppTheme('light');

    expect(theme.palette.primary.main).toBe('#DA4A2E');
    expect(theme.palette.error.main).toBe('#B91C1C');
    expect(theme.palette.success.main).toBe('#3F7D46');
  });

  it('tints accent backgrounds at 12% of the accent colour', () => {
    const theme = createAppTheme('light');

    expect(theme.palette.accentTint).toBe('rgba(218, 74, 46, 0.12)');
  });

  it('sets the design typeface ahead of the system fallbacks', () => {
    const theme = createAppTheme('light');

    expect(theme.typography.fontFamily).toMatch(/^"Plus Jakarta Sans"/);
    // A fallback still has to exist for the moment before the webfont paints.
    expect(theme.typography.fontFamily).toMatch(/sans-serif$/);
  });
});

/**
 * AC 7: a dark palette must be addable by supplying a second token set. That is
 * only true if the theme factory reads every colour it uses out of the tokens it
 * is handed, so this feeds it a token set that shares no value with Carbon light
 * and checks the whole theme moved.
 */
describe('application theme — adding a further palette', () => {
  const inverted: PaletteTokens = {
    background: '#0A0A0A',
    surface: '#161616',
    surfaceAlt: '#242424',
    border: '#333333',
    inputBorder: '#444444',
    text: '#F4F4F4',
    textSecondary: '#A8A8A8',
    accent: '#FF8A65',
    danger: '#FF6B6B',
    success: '#6FCF7F',
  };

  it('builds a whole theme from a second token set without any further wiring', () => {
    const theme = createThemeFromTokens('dark', inverted);

    expect(theme.palette.mode).toBe('dark');
    expect(theme.palette.background.default).toBe('#0A0A0A');
    expect(theme.palette.background.paper).toBe('#161616');
    expect(theme.palette.surfaceAlt).toBe('#242424');
    expect(theme.palette.divider).toBe('#333333');
    expect(theme.palette.inputBorder).toBe('#444444');
    expect(theme.palette.text.primary).toBe('#F4F4F4');
    expect(theme.palette.text.secondary).toBe('#A8A8A8');
    expect(theme.palette.primary.main).toBe('#FF8A65');
    expect(theme.palette.error.main).toBe('#FF6B6B');
    expect(theme.palette.success.main).toBe('#6FCF7F');
    expect(theme.palette.accentTint).toBe('rgba(255, 138, 101, 0.12)');
  });
});
