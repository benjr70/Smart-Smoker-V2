/**
 * What the touchscreen makes of a catalogue: which stamps it offers, and what
 * an event logged under one is called now.
 */
import { CookStamp, DEFAULT_STAMPS, enabledStamps, normalizeStamps } from './cookStamps';
import { resolveStampLabel, resolveStampTone } from './cookStamps';

const stamp = (key: string, label: string, enabled = true): CookStamp => ({
  key,
  label,
  tone: 'p1',
  enabled,
  custom: false,
});

describe('the catalogue the panel draws its buttons from', () => {
  it('offers the stamps the user left switched on, in catalogue order', () => {
    const catalogue = [stamp('wood', 'Added Wood'), stamp('wrap', 'Wrapped', false)];

    expect(enabledStamps(catalogue).map(s => s.key)).toEqual(['wood']);
  });

  it('falls back to the shipped stamps when the installation has stored none', () => {
    expect(normalizeStamps(undefined).map(s => s.key)).toEqual(DEFAULT_STAMPS.map(s => s.key));
    expect(normalizeStamps([]).map(s => s.key)).toEqual(DEFAULT_STAMPS.map(s => s.key));
  });

  it('hands back a catalogue of its own, so a screen cannot edit the stored one', () => {
    const stored = [stamp('wood', 'Added Wood')];

    normalizeStamps(stored)[0].label = 'Something Else';

    expect(stored[0].label).toBe('Added Wood');
  });
});

/**
 * A rename made on a phone applies to everything ever logged under that stamp —
 * the marker on the chart included — while an event whose stamp has since been
 * removed keeps what it was logged under, which is all that is left to name it
 * by.
 */
describe('naming what was logged', () => {
  const catalogue = [{ ...stamp('wood', 'Split Added'), tone: 'p2' as const }];

  it('calls an event what its stamp is called now', () => {
    expect(resolveStampLabel('wood', 'Added Wood', catalogue)).toBe('Split Added');
    expect(resolveStampTone('wood', 'amber', catalogue)).toBe('p2');
  });

  it('keeps a removed stamp’s history legible rather than blank', () => {
    expect(resolveStampLabel('custom-01H', 'Mopped', catalogue)).toBe('Mopped');
    expect(resolveStampTone('custom-01H', 'amber', catalogue)).toBe('amber');
  });
});
