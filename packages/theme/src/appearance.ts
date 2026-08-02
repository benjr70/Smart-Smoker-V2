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

/**
 * Turn a stored preference and the system's preference into a rendered scheme.
 *
 * A browser client is the only kind of client that can answer "what does the
 * system want"; the touchscreen's rules arrive in a later slice.
 */
export const resolveAppearance = ({
  stored,
  systemDark,
}: AppearanceInput): AppearanceResolution => {
  const mode: AppearanceMode = stored?.mode ?? 'system';
  const colorScheme: ColorScheme = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  const preference: AppearancePreference = { mode, resolvedMode: colorScheme };
  const shouldPersist =
    stored === null || stored.mode !== preference.mode || stored.resolvedMode !== colorScheme;

  return { colorScheme, preference, shouldPersist };
};
