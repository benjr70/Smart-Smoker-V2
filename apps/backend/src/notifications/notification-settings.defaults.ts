import { NotificationSettings } from './notificationSettings.schema';

/**
 * The settings a smoker starts from.
 *
 * The old freeform rule documents are deliberately not migrated (no rule in that
 * schema ever fired correctly), so the first read after this slice deploys finds
 * either nothing or a document of the deleted shape. Both resolve to these
 * defaults rather than to an error, which is the only reason the settings page
 * still renders on an upgraded deployment.
 */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  chamber: { enabled: false, low: 225, high: 275 },
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
 */
export const withSettingsDefaults = (
  stored: Partial<NotificationSettings> | null | undefined,
): NotificationSettings => {
  const chamber = stored?.chamber;
  const defaults = DEFAULT_NOTIFICATION_SETTINGS.chamber;
  return {
    chamber: {
      enabled: chamber?.enabled ?? defaults.enabled,
      low: chamber?.low ?? defaults.low,
      high: chamber?.high ?? defaults.high,
    },
  };
};
