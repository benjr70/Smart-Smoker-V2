import {
  DEFAULT_STAMP_KEYS,
  STAMP_TONES,
  defaultStamps,
  findStamp,
  resolveLabel,
  resolveTone,
} from './stamp-catalogue';

describe('stamp catalogue', () => {
  it('offers the six default stamps, in the order the buttons are laid out', () => {
    expect(defaultStamps().map((stamp) => stamp.key)).toEqual([
      'wood',
      'wrap',
      'spritz',
      'vent',
      'lid',
      'sauce',
    ]);
    expect(defaultStamps().map((stamp) => stamp.label)).toEqual([
      'Added Wood',
      'Wrapped',
      'Spritzed',
      'Vent',
      'Lid Open',
      'Sauced',
    ]);
    expect(DEFAULT_STAMP_KEYS).toEqual(defaultStamps().map((s) => s.key));
  });

  it('gives every default stamp a tone from the palette, enabled and not custom', () => {
    defaultStamps().forEach((stamp) => {
      expect(STAMP_TONES).toContain(stamp.tone);
      expect(stamp.enabled).toBe(true);
      expect(stamp.custom).toBe(false);
    });
  });

  it('hands out copies, so a caller editing the list cannot edit the defaults', () => {
    defaultStamps()[0].label = 'Split';

    expect(defaultStamps()[0].label).toBe('Added Wood');
  });

  it('finds a stamp by its key, and nothing for a key it does not know', () => {
    expect(findStamp('wrap')?.label).toBe('Wrapped');
    expect(findStamp('nonesuch')).toBeUndefined();
  });

  it('renders the catalogue label for a key it still knows', () => {
    expect(resolveLabel('wood', 'whatever it was called')).toBe('Added Wood');
    expect(resolveTone('wood', 'sub')).toBe(findStamp('wood')?.tone);
  });

  it('falls back to the label the event was logged under when the key is gone', () => {
    expect(resolveLabel('custom-01', 'Foil Boat')).toBe('Foil Boat');
    expect(resolveTone('custom-01', 'amber')).toBe('amber');
  });

  it('resolves against a supplied catalogue, so a renamed stamp applies retroactively', () => {
    const catalogue = defaultStamps().map((stamp) =>
      stamp.key === 'wood' ? { ...stamp, label: 'Split' } : stamp,
    );

    expect(resolveLabel('wood', 'Added Wood', catalogue)).toBe('Split');
  });
});
