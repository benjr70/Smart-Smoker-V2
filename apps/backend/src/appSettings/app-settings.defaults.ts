import { ApplicationSettings } from './app-settings.schema';

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
  appearance: { mode: 'system', resolvedMode: 'light' },
};

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
  const appearance = stored?.appearance;
  const defaults = DEFAULT_APPLICATION_SETTINGS;
  return {
    chamber: {
      enabled: chamber?.enabled ?? defaults.chamber.enabled,
      low: chamber?.low ?? defaults.chamber.low,
      high: chamber?.high ?? defaults.chamber.high,
    },
    appearance: {
      mode: appearance?.mode ?? defaults.appearance.mode,
      resolvedMode:
        appearance?.resolvedMode ?? defaults.appearance.resolvedMode,
    },
  };
};
