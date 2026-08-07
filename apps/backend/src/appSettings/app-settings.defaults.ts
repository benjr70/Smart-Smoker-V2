import {
  ApplicationSettings,
  ProbeTargetEntry,
  TargetPresets,
  TargetSource,
} from './app-settings.schema';
import { PROBE_SLOTS } from './probe-names';

/**
 * The target a probe carries until the user — or the preset matched to what is
 * cooking — sets one. 203°F is where a brisket is done, which is the cook this
 * smoker is built around.
 */
export const DEFAULT_PROBE_TARGET = 203;

/**
 * The temperature each category of meat is taken to be done at until the user
 * says otherwise: brisket and other beef pulled at 203°F, pork shoulder at
 * 195°F, poultry at the 165°F it is safe to eat at.
 */
export const DEFAULT_TARGET_PRESETS: TargetPresets = {
  beef: 203,
  pork: 195,
  poultry: 165,
};

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
      targetSource: 'default',
    })),
  },
  smokeComplete: { enabled: false },
  targetPresets: DEFAULT_TARGET_PRESETS,
  // "Follow the device", recorded as dark. The resolved half is written by
  // browsers and read only by the touchscreen, which renders it verbatim rather
  // than resolving anything itself — and this document is served whether or not
  // a browser has ever written one, so on a fresh installation this value *is*
  // what the panel in the garage renders. Light would boot it dark and then
  // repaint it to a sheet of white in an unlit room; it costs a browser nothing,
  // because a browser resolves "follow the device" against the machine in front
  // of it and never reads this half. Pinned to the clients' own default by
  // `appearance.spec.ts`.
  appearance: { mode: 'system', resolvedMode: 'dark' },
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
    const target = entry?.target ?? DEFAULT_PROBE_TARGET;
    return {
      slot,
      enabled: entry?.enabled ?? false,
      target,
      targetSource: entry?.targetSource ?? inheritedProvenance(target),
    };
  });

/**
 * What a target stored before provenance was recorded has to be read as.
 *
 * Editable per-probe targets shipped a slice before seeding did, so every
 * installation upgrading into this one carries targets a person typed with
 * nothing on the row saying so. A temperature that is not the shipped default
 * could only have got there by hand, and is read as the user's: seeding must
 * never quietly replace a 145°F pork loin with a category's 195°F. One still
 * sitting on the default is indistinguishable from a row nobody ever opened,
 * so it is read as untouched and the upgraded installation still gets presets.
 */
const inheritedProvenance = (target: number): TargetSource =>
  target === DEFAULT_PROBE_TARGET ? 'default' : 'user';

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
  const smokeComplete = stored?.smokeComplete;
  const targetPresets = stored?.targetPresets;
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
    smokeComplete: {
      enabled: smokeComplete?.enabled ?? defaults.smokeComplete.enabled,
    },
    targetPresets: {
      beef: targetPresets?.beef ?? defaults.targetPresets.beef,
      pork: targetPresets?.pork ?? defaults.targetPresets.pork,
      poultry: targetPresets?.poultry ?? defaults.targetPresets.poultry,
    },
    appearance: {
      mode: appearance?.mode ?? defaults.appearance.mode,
      resolvedMode:
        appearance?.resolvedMode ?? defaults.appearance.resolvedMode,
    },
  };
};
