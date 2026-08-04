/** The colour schemes the application can render in. */
export type ColorScheme = 'light' | 'dark';

/** What an operator can ask for: a fixed scheme, or "follow the device". */
export type AppearanceMode = ColorScheme | 'system';

/** The stored preference: what was asked for, and what it resolved to. */
export interface AppearancePreference {
  mode: AppearanceMode;
  resolvedMode: ColorScheme;
}

/**
 * The kinds of client the rule answers for.
 *
 * A browser can ask the machine it runs on which colour scheme it wants; the
 * touchscreen cannot — its panel reports light however dark the garage is — so
 * the two read the same stored preference differently. Which one is asking is
 * therefore part of the question, not something the rule could work out.
 */
export type AppearanceClient = 'browser' | 'device';

/** Everything the resolver is given. Nothing here is read from the world. */
export interface AppearanceInput {
  /** The preference as stored, or `null` when nothing has been stored yet. */
  stored: AppearancePreference | null;
  /**
   * Whether the operating system asks for a dark interface.
   *
   * Optional because a device client has no answer to give: it never consults
   * this, and omitting it says so. Left out by a browser it means the same as it
   * means in {@link DEFAULT_APPEARANCE_PREFERENCE} — a client with no device
   * preference of its own reads light.
   */
  systemDark?: boolean;
  /** Which kind of client is asking. A client that does not say is a browser. */
  client?: AppearanceClient;
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
 * What the touchscreen renders until it has been told anything else.
 *
 * It is an appliance in a garage with an 800x480 panel: the wrong answer there
 * is a sheet of white in a dark room, so an installation nobody has chosen an
 * appearance on, and a device that has not yet heard from the backend, both
 * leave it dark. The served page and the shell's window are painted from this
 * same choice, so there is no flash before the application runs either.
 */
export const DEVICE_DEFAULT_COLOR_SCHEME: ColorScheme = 'dark';

/**
 * What the touchscreen renders, which is never anything it worked out itself.
 *
 * The device has no operating-system preference to consult and no operator
 * sitting at it, so it renders the value a browser resolved on its behalf and
 * recorded — the chosen mode is none of its business, including when that mode
 * is "follow the device". It has nothing to tell the installation either, so it
 * never asks for a write.
 */
const resolveForDevice = (stored: AppearancePreference | null): AppearanceResolution => {
  const colorScheme: ColorScheme = stored?.resolvedMode ?? DEVICE_DEFAULT_COLOR_SCHEME;

  return {
    colorScheme,
    preference: { mode: stored?.mode ?? 'system', resolvedMode: colorScheme },
    shouldPersist: false,
  };
};

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
  systemDark = false,
  client = 'browser',
}: AppearanceChoiceInput): AppearanceResolution => {
  if (client === 'device') {
    return resolveForDevice(stored);
  }

  const colorScheme: ColorScheme = chosen === 'system' ? (systemDark ? 'dark' : 'light') : chosen;

  const preference: AppearancePreference = { mode: chosen, resolvedMode: colorScheme };
  const shouldPersist =
    stored === null || stored.mode !== preference.mode || stored.resolvedMode !== colorScheme;

  return { colorScheme, preference, shouldPersist };
};

/**
 * Whether a preference says the same thing twice.
 *
 * A preference is two halves of one statement — what was asked for, and what it
 * resolved to on the client that wrote it — so the halves can contradict each
 * other. "Always light, currently dark" could never have come from the rule
 * above, and anything asked to store a preference refuses it rather than leaving
 * every reader to guess which half was meant.
 *
 * Asked *through* the resolver rather than restated beside it: a preference is
 * coherent exactly when resolving its own mode, on a device set the way it
 * claims, gives back what it claims. Whatever the resolver learns next, this
 * learns with it — which is the whole point of there being one rule.
 */
export const isCoherentPreference = ({ mode, resolvedMode }: AppearancePreference): boolean =>
  resolveChoice({ chosen: mode, stored: null, systemDark: resolvedMode === 'dark' }).colorScheme ===
  resolvedMode;

/**
 * What an installation nobody has chosen an appearance on is taken to have
 * chosen.
 *
 * "Follow the device", resolved the way a client with no device preference of
 * its own resolves it. Storage, the API and every client start from this one
 * value, so "nothing chosen yet" cannot mean something different in each of
 * them.
 */
export const DEFAULT_APPEARANCE_PREFERENCE: AppearancePreference = {
  mode: 'system',
  resolvedMode: 'light',
};

/**
 * Turn a stored preference and the system's preference into a rendered scheme.
 *
 * Loading is choosing what is already stored — or "follow the device" when
 * nothing is — so it is the same rule with the mode read out of storage rather
 * than off a button.
 *
 * A browser client is the only kind of client that can answer "what does the
 * system want", and the only one that ever writes an answer down. A device
 * client reads the answer it left (see {@link AppearanceClient}).
 */
export const resolveAppearance = ({
  stored,
  systemDark,
  client,
}: AppearanceInput): AppearanceResolution =>
  resolveChoice({ chosen: stored?.mode ?? 'system', stored, systemDark, client });
