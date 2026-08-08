/**
 * The one rule that turns a stored preference into a rendered colour scheme.
 *
 * Pure input to output: no browser, no storage, no network, no clock — so every
 * combination can simply be stated. Everything that renders the app, and the
 * backend that validates a write, is expected to reach the same answers as this
 * table.
 */
import {
  AppearanceMode,
  ColorScheme,
  DEFAULT_APPEARANCE_PREFERENCE,
  DEVICE_DEFAULT_COLOR_SCHEME,
  isCoherentPreference,
  resolveAppearance,
  resolveChoice,
} from './appearance';

describe('a browser client with nothing stored', () => {
  it('follows the system preference', () => {
    expect(resolveAppearance({ stored: null, systemDark: true })).toMatchObject({
      colorScheme: 'dark',
      preference: { mode: 'system', resolvedMode: 'dark' },
    });
  });

  it('follows a system that is not dark, too', () => {
    expect(resolveAppearance({ stored: null, systemDark: false })).toMatchObject({
      colorScheme: 'light',
      preference: { mode: 'system', resolvedMode: 'light' },
    });
  });
});

/** Every combination of what was chosen and how the device is set. */
describe.each<[AppearanceMode, boolean, ColorScheme]>([
  ['system', false, 'light'],
  ['system', true, 'dark'],
  ['light', false, 'light'],
  ['light', true, 'light'],
  ['dark', false, 'dark'],
  ['dark', true, 'dark'],
])('a stored choice of "%s" with the device dark: %s', (mode, systemDark, expected) => {
  it(`renders in ${expected}`, () => {
    const stored = { mode, resolvedMode: 'light' } as const;

    expect(resolveAppearance({ stored, systemDark }).colorScheme).toBe(expected);
  });

  it('keeps the choice and records what it resolved to', () => {
    const stored = { mode, resolvedMode: 'light' } as const;

    expect(resolveAppearance({ stored, systemDark }).preference).toEqual({
      mode,
      resolvedMode: expected,
    });
  });
});

describe('whether the resolved scheme has to be written back', () => {
  it('leaves storage alone when it already says what the choice resolves to', () => {
    const stored = { mode: 'system', resolvedMode: 'dark' } as const;

    expect(resolveAppearance({ stored, systemDark: true }).shouldPersist).toBe(false);
  });

  it('asks for a write when the device has moved away from what is stored', () => {
    const stored = { mode: 'system', resolvedMode: 'light' } as const;

    expect(resolveAppearance({ stored, systemDark: true })).toMatchObject({
      colorScheme: 'dark',
      preference: { mode: 'system', resolvedMode: 'dark' },
      shouldPersist: true,
    });
  });

  it('asks for a write when nothing has ever been stored', () => {
    expect(resolveAppearance({ stored: null, systemDark: false }).shouldPersist).toBe(true);
  });
});

/**
 * Choosing is the same rule pointed the other way: instead of asking what the
 * stored preference resolves to, it asks what a freshly chosen mode amounts to
 * and whether storage now disagrees with it.
 */
describe('choosing an option', () => {
  it('resolves the chosen mode against the device', () => {
    expect(
      resolveChoice({
        chosen: 'system',
        stored: { mode: 'light', resolvedMode: 'light' },
        systemDark: true,
      })
    ).toMatchObject({
      colorScheme: 'dark',
      preference: { mode: 'system', resolvedMode: 'dark' },
    });
  });

  it('overrides the device when a scheme was chosen outright', () => {
    expect(
      resolveChoice({
        chosen: 'light',
        stored: { mode: 'system', resolvedMode: 'dark' },
        systemDark: true,
      })
    ).toMatchObject({
      colorScheme: 'light',
      preference: { mode: 'light', resolvedMode: 'light' },
      shouldPersist: true,
    });
  });

  /**
   * Choosing the option already in effect is a no-op, not a write. Two browsers
   * open on the settings page would otherwise take turns storing the value they
   * both already agree on.
   */
  it('asks for no write when the choice is what is already stored', () => {
    expect(
      resolveChoice({
        chosen: 'dark',
        stored: { mode: 'dark', resolvedMode: 'dark' },
        systemDark: false,
      }).shouldPersist
    ).toBe(false);
  });

  it('asks for a write when nothing has ever been stored', () => {
    expect(resolveChoice({ chosen: 'dark', stored: null, systemDark: false }).shouldPersist).toBe(
      true
    );
  });
});

/**
 * A preference is two halves of one statement, so the halves can disagree —
 * "always light" that resolved to dark could never have come from this rule.
 * Whoever is asked to store a preference asks this before believing it, which is
 * the same question as "could the rule have produced it?".
 */
describe('whether a preference says the same thing twice', () => {
  it.each<[AppearanceMode, ColorScheme]>([
    ['light', 'light'],
    ['dark', 'dark'],
    ['system', 'light'],
    ['system', 'dark'],
  ])('accepts %s resolved to %s', (mode, resolvedMode) => {
    expect(isCoherentPreference({ mode, resolvedMode })).toBe(true);
  });

  it.each<[AppearanceMode, ColorScheme]>([
    ['light', 'dark'],
    ['dark', 'light'],
  ])('refuses %s resolved to %s', (mode, resolvedMode) => {
    expect(isCoherentPreference({ mode, resolvedMode })).toBe(false);
  });

  /**
   * Stated through the resolver rather than beside it: a preference is coherent
   * exactly when resolving its own mode on a device set the way it claims gives
   * back what it claims. Extending the resolver therefore extends this too.
   */
  it('agrees with what the resolver would have produced', () => {
    const modes: AppearanceMode[] = ['light', 'dark', 'system'];
    const schemes: ColorScheme[] = ['light', 'dark'];

    modes.forEach(mode =>
      schemes.forEach(resolvedMode => {
        const resolved = resolveChoice({
          chosen: mode,
          stored: null,
          systemDark: resolvedMode === 'dark',
        }).colorScheme;

        expect(isCoherentPreference({ mode, resolvedMode })).toBe(resolved === resolvedMode);
      })
    );
  });
});

/**
 * The touchscreen bolted to the smoker. It has no operating-system preference
 * worth consulting — its panel reports light however dark the garage is — so it
 * resolves nothing: it renders the value some browser already resolved and
 * recorded, and that is the whole of its rule.
 */
describe.each<[AppearanceMode, ColorScheme, boolean]>([
  ['system', 'light', false],
  ['system', 'light', true],
  ['system', 'dark', false],
  ['system', 'dark', true],
  ['light', 'light', false],
  ['light', 'light', true],
  ['dark', 'dark', false],
  ['dark', 'dark', true],
])(
  'a device client, sent "%s" resolved to "%s" with the panel dark: %s',
  (mode, resolvedMode, systemDark) => {
    it(`renders in ${resolvedMode}, whatever the panel says`, () => {
      expect(
        resolveAppearance({ stored: { mode, resolvedMode }, systemDark, client: 'device' })
          .colorScheme
      ).toBe(resolvedMode);
    });

    /**
     * The device is a reader of the installation's appearance and nothing else.
     * A device that wrote what it had resolved would overwrite the browser that
     * knows what "follow the device" means with its own guess.
     */
    it('never asks for the value to be written back', () => {
      expect(
        resolveAppearance({ stored: { mode, resolvedMode }, systemDark, client: 'device' })
          .shouldPersist
      ).toBe(false);
    });
  }
);

/**
 * Nothing stored means something different to each kind of client, which is why
 * "nothing stored" cannot simply be one value. A browser can still ask the
 * machine it runs on; the appliance in the garage has nobody to ask, and the
 * safe answer for a panel in a dark room is the dark one.
 */
describe('a client with nothing stored', () => {
  it('leaves a device on the scheme the garage is lit for', () => {
    expect(resolveAppearance({ stored: null, client: 'device' })).toMatchObject({
      colorScheme: DEVICE_DEFAULT_COLOR_SCHEME,
      shouldPersist: false,
    });
  });

  it('is dark, so a panel nobody has chosen for does not light up a dark garage', () => {
    expect(DEVICE_DEFAULT_COLOR_SCHEME).toBe('dark');
  });

  it('still leaves a browser following the machine it runs on', () => {
    expect(resolveAppearance({ stored: null, systemDark: true }).colorScheme).toBe('dark');
    expect(resolveAppearance({ stored: null, systemDark: false }).colorScheme).toBe('light');
  });
});

/**
 * What an installation nobody has chosen an appearance on is taken to have
 * chosen: follow the device, recorded as the scheme the one client that reads
 * the recorded half needs.
 */
describe('the documented default', () => {
  it('is "follow the device", recorded as the panel in the garage needs it', () => {
    expect(DEFAULT_APPEARANCE_PREFERENCE).toEqual({
      mode: 'system',
      resolvedMode: DEVICE_DEFAULT_COLOR_SCHEME,
    });
  });

  /**
   * The recorded half exists for the touchscreen and is read by nothing else, so
   * on an installation where no browser has recorded one it has to say what the
   * touchscreen needs — otherwise the default is the one value that reaches the
   * garage, and it lights the room up. Storage answers with this default rather
   * than with nothing, so this is the value the panel actually resolves against:
   * the "nothing stored" rule below never gets a look in from a live backend.
   */
  it('leaves the touchscreen of an installation nobody has chosen for dark', () => {
    expect(
      resolveAppearance({ stored: DEFAULT_APPEARANCE_PREFERENCE, client: 'device' }).colorScheme
    ).toBe(DEVICE_DEFAULT_COLOR_SCHEME);
  });

  /**
   * And costs a browser nothing, because a browser never reads the recorded
   * half: it resolves "follow the device" against the machine in front of it.
   */
  it('still leaves a browser following the machine it runs on', () => {
    expect(
      resolveAppearance({ stored: DEFAULT_APPEARANCE_PREFERENCE, systemDark: true }).colorScheme
    ).toBe('dark');
    expect(
      resolveAppearance({ stored: DEFAULT_APPEARANCE_PREFERENCE, systemDark: false }).colorScheme
    ).toBe('light');
  });

  it('says the same thing twice, like any preference that may be stored', () => {
    expect(isCoherentPreference(DEFAULT_APPEARANCE_PREFERENCE)).toBe(true);
  });
});

/**
 * The rule is meant to be the one place the web app, the touchscreen and the
 * backend can all agree, which it can only be if it asks the world nothing. So
 * the world is taken away.
 */
describe('what the rule consults', () => {
  /** Make reading `globalThis[name]` throw, and hand back the undo. */
  const trap = (name: string): (() => void) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        throw new Error(`the appearance rule consulted ${name}`);
      },
    });
    return () => {
      if (original) {
        Object.defineProperty(globalThis, name, original);
      }
    };
  };

  it('resolves with the browser, storage, the network and the clock taken away', () => {
    const undo = ['matchMedia', 'localStorage', 'fetch', 'Date'].map(trap);

    try {
      expect(resolveAppearance({ stored: null, systemDark: true }).colorScheme).toBe('dark');
    } finally {
      undo.forEach(restore => restore());
    }
  });
});
