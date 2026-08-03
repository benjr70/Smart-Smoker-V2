/** The colour schemes the application can render in. */
export type ColorScheme = 'light' | 'dark';

/** What an operator can ask for: a fixed scheme, or "follow the device". */
export type AppearanceMode = ColorScheme | 'system';

/** The stored preference: what was asked for, and what it resolved to. */
export interface AppearancePreference {
  mode: AppearanceMode;
  resolvedMode: ColorScheme;
}

/** Everything the resolver is given. Nothing here is read from the world. */
export interface AppearanceInput {
  /** The preference as stored, or `null` when nothing has been stored yet. */
  stored: AppearancePreference | null;
  /** Whether the operating system asks for a dark interface. */
  systemDark: boolean;
}

/** Everything the resolver decides. */
export interface AppearanceResolution {
  /** The colour scheme to render in. */
  colorScheme: ColorScheme;
  /** The preference as it should now be stored. */
  preference: AppearancePreference;
  /**
   * Whether storage disagrees with that preference and has to be written. False
   * whenever the stored value already says what the choice resolves to, so
   * merely opening the app writes nothing.
   */
  shouldPersist: boolean;
}

/** Everything the choice rule is given. Nothing here is read from the world. */
export interface AppearanceChoiceInput extends AppearanceInput {
  /** The mode being chosen, which need not be the one stored. */
  chosen: AppearanceMode;
}

/**
 * Turn a mode into a rendered scheme, and say whether storage now disagrees.
 *
 * The one rule the whole product shares, in the form the act of choosing needs:
 * an operator picking an option is asking for a mode that is not what is
 * stored, and the answer has to say both what to paint and whether the choice
 * is news to anyone. `shouldPersist` is false whenever storage already says what
 * the choice resolves to, so merely opening the app — or picking the option
 * already in effect — writes nothing.
 */
export const resolveChoice = ({
  chosen,
  stored,
  systemDark,
}: AppearanceChoiceInput): AppearanceResolution => {
  const colorScheme: ColorScheme = chosen === 'system' ? (systemDark ? 'dark' : 'light') : chosen;

  const preference: AppearancePreference = { mode: chosen, resolvedMode: colorScheme };
  const shouldPersist =
    stored === null || stored.mode !== preference.mode || stored.resolvedMode !== colorScheme;

  return { colorScheme, preference, shouldPersist };
};

/**
 * Turn a stored preference and the system's preference into a rendered scheme.
 *
 * Loading is choosing what is already stored — or "follow the device" when
 * nothing is — so it is the same rule with the mode read out of storage rather
 * than off a button.
 *
 * A browser client is the only kind of client that can answer "what does the
 * system want"; the touchscreen's rules arrive in a later slice.
 */
export const resolveAppearance = ({ stored, systemDark }: AppearanceInput): AppearanceResolution =>
  resolveChoice({ chosen: stored?.mode ?? 'system', stored, systemDark });
