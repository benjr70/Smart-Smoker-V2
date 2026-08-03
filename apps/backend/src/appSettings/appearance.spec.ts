import {
  AppearanceMode,
  ColorScheme,
  DEFAULT_APPEARANCE_PREFERENCE,
  isCoherentPreference as sharedRule,
} from 'theme/src/appearance';
import { DEFAULT_APPLICATION_SETTINGS } from './app-settings.defaults';
import { isCoherentPreference } from './appearance';

/**
 * The rule that decides whether a stored appearance preference says one thing
 * twice or two different things. It is the backend's half of the shared
 * appearance resolver: the frontend picks a scheme with it, the backend refuses
 * to store a preference it could never have picked.
 */
describe('an appearance preference the backend will store', () => {
  it('accepts a fixed choice whose resolved value is that choice', () => {
    expect(isCoherentPreference({ mode: 'light', resolvedMode: 'light' })).toBe(
      true,
    );
    expect(isCoherentPreference({ mode: 'dark', resolvedMode: 'dark' })).toBe(
      true,
    );
  });

  /**
   * "Always light, currently dark" is not a preference anyone can act on — a
   * client that stored it would have to guess which half meant it.
   */
  it('rejects a fixed choice whose resolved value contradicts it', () => {
    expect(isCoherentPreference({ mode: 'light', resolvedMode: 'dark' })).toBe(
      false,
    );
    expect(isCoherentPreference({ mode: 'dark', resolvedMode: 'light' })).toBe(
      false,
    );
  });

  /**
   * Following the device resolves to whatever the writing client's device asked
   * for, so both values are legitimate here — that is the whole point of the
   * resolved half being stored alongside the mode.
   */
  it('accepts following the device resolving either way', () => {
    expect(isCoherentPreference({ mode: 'system', resolvedMode: 'dark' })).toBe(
      true,
    );
    expect(
      isCoherentPreference({ mode: 'system', resolvedMode: 'light' }),
    ).toBe(true);
  });
});

/**
 * The rule the whole product shares lives in the theme package, where the web
 * app and the touchscreen read it. The backend cannot run that package — it is
 * built for the browser and the server image carries no copy of it — so it keeps
 * its own statement of the rule and this test holds the two together: every
 * preference either module can be asked about, asked of both.
 *
 * Without it, extending the shared resolver (the touchscreen's rules are next)
 * would leave the backend quietly enforcing the older rule and accepting or
 * refusing preferences the rest of the product disagrees with.
 */
describe('the backend rule against the one the product shares', () => {
  const modes: AppearanceMode[] = ['light', 'dark', 'system'];
  const schemes: ColorScheme[] = ['light', 'dark'];

  it.each(
    modes.flatMap((mode) =>
      schemes.map((resolvedMode) => ({ mode, resolvedMode })),
    ),
  )('answers alike about %j', (preference) => {
    expect(isCoherentPreference(preference)).toBe(sharedRule(preference));
  });

  /**
   * "Nothing chosen yet" has to mean the same thing in storage as it does in
   * the clients reading it, or a fresh installation disagrees with itself.
   */
  it('starts a fresh installation from the preference the clients default to', () => {
    expect(DEFAULT_APPLICATION_SETTINGS.appearance).toEqual(
      DEFAULT_APPEARANCE_PREFERENCE,
    );
  });
});
