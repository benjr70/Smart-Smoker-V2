import {
  CookStamp,
  DEFAULT_STAMP_KEYS,
  STAMP_TONES,
  defaultStamps,
  normalizeStamps,
  findStamp,
  resolveLabel,
  resetStamps,
  resolveTone,
  validateStamps,
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

describe('reading a stored catalogue', () => {
  it('reads the six defaults on an installation that has stored no block', () => {
    expect(normalizeStamps(undefined)).toEqual(defaultStamps());
    expect(normalizeStamps(null)).toEqual(defaultStamps());
    expect(normalizeStamps([])).toEqual(defaultStamps());
  });

  it('keeps the order and the edits the user made, and puts back a default that went missing', () => {
    const read = normalizeStamps([
      {
        key: 'wrap',
        label: 'Wrapped',
        tone: 'p1',
        enabled: false,
        custom: false,
      },
      {
        key: 'custom-01ARZ3NDEKTSV4RRFFQ69G5FAV',
        label: 'Foil Boat',
        tone: 'amber',
        enabled: true,
        custom: true,
      },
    ]);

    expect(read.slice(0, 2)).toEqual([
      {
        key: 'wrap',
        label: 'Wrapped',
        tone: 'p1',
        enabled: false,
        custom: false,
      },
      {
        key: 'custom-01ARZ3NDEKTSV4RRFFQ69G5FAV',
        label: 'Foil Boat',
        tone: 'amber',
        enabled: true,
        custom: true,
      },
    ]);
    expect(read.map((stamp) => stamp.key).sort()).toEqual(
      [...DEFAULT_STAMP_KEYS, 'custom-01ARZ3NDEKTSV4RRFFQ69G5FAV'].sort(),
    );
  });

  it('drops a stored entry no button could be drawn from', () => {
    const read = normalizeStamps([
      {
        key: 'wood',
        label: 'Split',
        tone: 'nonesuch' as never,
        enabled: true,
        custom: false,
      },
      { key: 'wood', label: 'Twice', tone: 'p1', enabled: true, custom: false },
      {
        key: 'not-a-custom-key',
        label: 'Smuggled',
        tone: 'p1',
        enabled: true,
        custom: true,
      },
      null,
    ]);

    // The bad tone falls back to the default's own colour rather than taking
    // the stamp off the screen; the duplicate and the unkeyed entry go.
    expect(read.filter((stamp) => stamp.key === 'wood')).toEqual([
      {
        key: 'wood',
        label: 'Split',
        tone: 'amber',
        enabled: true,
        custom: false,
      },
    ]);
    expect(read.map((stamp) => stamp.key)).not.toContain('not-a-custom-key');
    expect(read).toHaveLength(6);
  });
});

describe('validating a catalogue a client asked to store', () => {
  const custom = (label: string): CookStamp => ({
    key: 'custom-01ARZ3NDEKTSV4RRFFQ69G5FAV',
    label,
    tone: 'amber',
    enabled: true,
    custom: true,
  });

  it('accepts the defaults, a disabled default and a well-keyed custom stamp', () => {
    expect(validateStamps(defaultStamps())).toBeNull();
    expect(
      validateStamps(
        defaultStamps().map((stamp) =>
          stamp.key === 'lid' ? { ...stamp, enabled: false } : stamp,
        ),
      ),
    ).toBeNull();
    expect(
      validateStamps([...defaultStamps(), custom('Foil Boat')]),
    ).toBeNull();
  });

  it('refuses a label that is empty or longer than sixteen characters', () => {
    expect(validateStamps([...defaultStamps(), custom('  ')])).toMatch(
      /label/i,
    );
    expect(
      validateStamps([...defaultStamps(), custom('seventeen chars!!')]),
    ).toMatch(/label/i);
  });

  it('refuses a colour that is not one a stamp may be drawn in', () => {
    expect(
      validateStamps([
        ...defaultStamps(),
        { ...custom('Rotated'), tone: 'purple' as never },
      ]),
    ).toMatch(/tone/i);
  });

  it('refuses two stamps sharing one identity', () => {
    expect(
      validateStamps([
        ...defaultStamps(),
        custom('Rotated'),
        custom('Rotated'),
      ]),
    ).toMatch(/unique|duplicate/i);
  });

  it('refuses a thirteenth stamp', () => {
    const customs = Array.from({ length: 7 }, (_, index) => ({
      ...custom(`Extra ${index}`),
      key: `custom-01ARZ3NDEKTSV4RRFFQ69G5FA${'BCDEFGH'[index]}`,
    }));

    expect(
      validateStamps([...defaultStamps(), ...customs.slice(0, 6)]),
    ).toBeNull();
    expect(validateStamps([...defaultStamps(), ...customs])).toMatch(
      /12|twelve/i,
    );
  });

  it('refuses a list that has dropped one of the six defaults', () => {
    expect(
      validateStamps(defaultStamps().filter((stamp) => stamp.key !== 'vent')),
    ).toMatch(/vent/);
  });

  it('refuses a user-added stamp whose key is not custom-<ulid>', () => {
    expect(
      validateStamps([
        ...defaultStamps(),
        { ...custom('Rotated'), key: 'rotated' },
      ]),
    ).toMatch(/key/i);
  });
});

describe('resetting the catalogue', () => {
  it('restores the six defaults, enabled, and drops every custom stamp', () => {
    const reset = resetStamps();

    expect(reset).toEqual(defaultStamps());
    expect(reset.some((stamp) => stamp.custom)).toBe(false);
    expect(reset.every((stamp) => stamp.enabled)).toBe(true);
    expect(validateStamps(reset)).toBeNull();
  });
});
