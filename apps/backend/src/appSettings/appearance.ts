/**
 * The appearance preference and the one rule the backend enforces about it.
 *
 * Pure, like the alert engine: no database, no request, no clock. It is the half
 * the backend needs of the resolver in `packages/theme`, so that a preference
 * which could never have been resolved cannot be stored by a buggy or hostile
 * client and then handed to every other client as truth.
 *
 * Stated here rather than imported because the shared package is built for the
 * browser: it is consumed from source by the web app's bundler, while this
 * service ships as `dist/main.js` beside no copy of it. What keeps the two from
 * drifting is a test rather than an import — `appearance.spec.ts` asks both
 * modules about every preference either can be asked about and requires the same
 * answer, so extending the shared resolver fails here until this follows.
 */

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
 * Whether a preference says the same thing twice.
 *
 * A fixed choice resolves to itself and nothing else. Following the device
 * resolves to whatever the writing client's device asked for, so both values are
 * coherent there — which is precisely why the resolved half is stored at all.
 */
export const isCoherentPreference = (
  preference: AppearancePreference,
): boolean =>
  preference.mode === 'system' || preference.mode === preference.resolvedMode;
