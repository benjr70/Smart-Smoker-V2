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
