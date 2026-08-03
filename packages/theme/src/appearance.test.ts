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
 * What an installation nobody has chosen an appearance on is taken to have
 * chosen: follow the device, which a client with no device preference of its own
 * reads as light.
 */
describe('the documented default', () => {
  it('is "follow the device", resolved as a client with no device would', () => {
    expect(DEFAULT_APPEARANCE_PREFERENCE).toEqual({ mode: 'system', resolvedMode: 'light' });
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
