import {
  DEFAULT_STAMPS,
  MAX_STAMPS,
  STAMP_TONES,
  CookStamp,
  enabledStamps,
  isDefaultCatalogue,
  newCustomStamp,
  normalizeStamps,
  resolveStampLabel,
  resolveStampTone,
} from './cookStamps';

/** A user-added stamp, as the editor mints one. */
const custom = (label: string): CookStamp => ({ ...newCustomStamp(), label });

describe('the stamp catalogue this app holds', () => {
  it('ships the six defaults, enabled and not custom', () => {
    expect(DEFAULT_STAMPS.map(stamp => stamp.key)).toEqual([
      'wood',
      'wrap',
      'spritz',
      'vent',
      'lid',
      'sauce',
    ]);
    expect(DEFAULT_STAMPS.every(stamp => stamp.enabled && !stamp.custom)).toBe(true);
  });

  it('reads the defaults from a backend that served no catalogue', () => {
    expect(normalizeStamps(undefined)).toEqual([...DEFAULT_STAMPS]);
    expect(normalizeStamps([])).toEqual([...DEFAULT_STAMPS]);
  });

  it('keeps a served catalogue as the backend ordered it', () => {
    const served = [custom('Foil Boat'), ...DEFAULT_STAMPS];

    expect(normalizeStamps(served)).toEqual(served);
  });

  it('offers only the stamps the user left switched on', () => {
    const catalogue = DEFAULT_STAMPS.map(stamp =>
      stamp.key === 'lid' ? { ...stamp, enabled: false } : stamp
    );

    expect(enabledStamps(catalogue).map(stamp => stamp.key)).not.toContain('lid');
    expect(enabledStamps(catalogue)).toHaveLength(5);
  });

  it('mints a custom stamp with its own identity, enabled and removable', () => {
    const one = newCustomStamp();
    const other = newCustomStamp();

    expect(one.key).toMatch(/^custom-[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(one.key).not.toBe(other.key);
    expect(one.custom).toBe(true);
    expect(one.enabled).toBe(true);
    expect(STAMP_TONES).toContain(one.tone);
  });

  it('names an event by what its stamp is called now, and by its snapshot when the stamp is gone', () => {
    const renamed = DEFAULT_STAMPS.map(stamp =>
      stamp.key === 'wood' ? { ...stamp, label: 'Split', tone: 'p2' as const } : stamp
    );

    expect(resolveStampLabel('wood', 'Added Wood', renamed)).toBe('Split');
    expect(resolveStampTone('wood', 'amber', renamed)).toBe('p2');
    expect(resolveStampLabel('custom-gone', 'Foil Boat', renamed)).toBe('Foil Boat');
    expect(resolveStampTone('custom-gone', 'sub', renamed)).toBe('sub');
  });

  it('knows a catalogue nobody has edited from one they have', () => {
    expect(isDefaultCatalogue([...DEFAULT_STAMPS])).toBe(true);
    expect(isDefaultCatalogue([...DEFAULT_STAMPS, custom('Rotated')])).toBe(false);
    expect(
      isDefaultCatalogue(
        DEFAULT_STAMPS.map(stamp => (stamp.key === 'lid' ? { ...stamp, enabled: false } : stamp))
      )
    ).toBe(false);
    expect(isDefaultCatalogue([...DEFAULT_STAMPS].reverse())).toBe(false);
  });

  it('caps the catalogue at twelve stamps', () => {
    expect(MAX_STAMPS).toBe(12);
  });
});
