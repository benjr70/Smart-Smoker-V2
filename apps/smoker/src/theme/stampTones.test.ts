/**
 * What colour a stamp is drawn in on the touchscreen. The same six names the
 * web application resolves, resolved against the same design palette, so a
 * marker on the pit's chart matches the dot beside the same event on a phone.
 */
import { carbonDark, resolveDesignPalette } from 'theme/src';
import { STAMP_TONES } from '../api';
import { toneColor } from './stampTones';

const design = resolveDesignPalette(carbonDark, 'dark');

describe('a stamp’s tone on the touchscreen', () => {
  it('names the reading it belongs to, so a marker matches the line beside it', () => {
    expect(toneColor('chamber', design)).toBe(design.probes.chamber);
    expect(toneColor('p1', design)).toBe(design.probes.probe1);
    expect(toneColor('p2', design)).toBe(design.probes.probe2);
    expect(toneColor('p3', design)).toBe(design.probes.probe3);
  });

  /**
   * The two tones that name no reading are what let a stamp stand apart from
   * every line on the plot. The design carries no amber token of its own, so
   * the accent — the warm colour of this palette — stands in for it.
   */
  it('draws the tones that name no probe apart from the plot', () => {
    expect(toneColor('amber', design)).toBe(design.accent);
    expect(toneColor('sub', design)).toBe(design.textSecondary);
  });

  it('has a colour for every tone a stamp may carry', () => {
    STAMP_TONES.forEach(tone => expect(toneColor(tone, design)).toBeTruthy());
  });
});
