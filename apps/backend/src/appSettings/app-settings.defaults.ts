import { ApplicationSettings, ProbeTargetEntry } from './app-settings.schema';
import { PROBE_SLOTS } from './probe-names';

/**
 * The target a probe carries until the user (or, from the preset-seeding slice,
 * a matched meat category) sets one. 203°F is where a brisket is done, which is
 * the cook this smoker is built around.
 */
export const DEFAULT_PROBE_TARGET = 203;

/**
 * The settings an installation starts from.
 *
 * The old freeform notification rule documents are deliberately not migrated (no
 * rule in that schema ever fired correctly), so the first read after that slice
 * deployed finds either nothing or a document of the deleted shape. Both resolve
 * to these defaults rather than to an error, which is the only reason the
 * settings page still renders on an upgraded deployment.
 */
export const DEFAULT_APPLICATION_SETTINGS: ApplicationSettings = {
  chamber: { enabled: false, low: 225, high: 275 },
  probeTarget: {
    enabled: false,
    probes: PROBE_SLOTS.map((slot) => ({
      slot,
      enabled: false,
      target: DEFAULT_PROBE_TARGET,
    })),
  },
  appearance: { mode: 'system', resolvedMode: 'light' },
};

/**
 * Exactly one entry per probe slot, in slot order, whatever subset was stored.
 *
 * Both the settings page and the alert engine walk this list, so neither can be
 * left to guess which slots exist — and the list is what a document saved before
 * a slot existed (or with one dropped) is read back as.
 */
const withProbeEntryPerSlot = (
  stored: ProbeTargetEntry[] | null | undefined,
): ProbeTargetEntry[] =>
  PROBE_SLOTS.map((slot) => {
    const entry = stored?.find((candidate) => candidate?.slot === slot);
    return {
      slot,
      enabled: entry?.enabled ?? false,
      target: entry?.target ?? DEFAULT_PROBE_TARGET,
    };
  });

/**
 * A stored (or client-supplied) document read as complete settings: every field
 * missing from it falls back to its default. One function so the read path, the
 * write path and the alert engine can never disagree about what "unset" means.
 *
 * Each field is named rather than copied wholesale, because what arrives here is
 * usually a Mongoose document: its nested blocks are subdocuments whose own
 * enumerable properties are persistence internals (`$__`, `_doc`, …), not the
 * settings. Spreading one would publish those over the API and drop the values.
 * Naming every field is also what keeps the deleted rule shape from surviving a
 * save.
 */
export const withSettingsDefaults = (
  stored: Partial<ApplicationSettings> | null | undefined,
): ApplicationSettings => {
  const chamber = stored?.chamber;
  const probeTarget = stored?.probeTarget;
  const appearance = stored?.appearance;
  const defaults = DEFAULT_APPLICATION_SETTINGS;
  return {
    chamber: {
      enabled: chamber?.enabled ?? defaults.chamber.enabled,
      low: chamber?.low ?? defaults.chamber.low,
      high: chamber?.high ?? defaults.chamber.high,
    },
    probeTarget: {
      enabled: probeTarget?.enabled ?? defaults.probeTarget.enabled,
      probes: withProbeEntryPerSlot(probeTarget?.probes),
    },
    appearance: {
      mode: appearance?.mode ?? defaults.appearance.mode,
      resolvedMode:
        appearance?.resolvedMode ?? defaults.appearance.resolvedMode,
    },
  };
};
