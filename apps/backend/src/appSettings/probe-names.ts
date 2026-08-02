/**
 * What the smoker's probes are called, resolved for whatever is cooking now.
 *
 * Probe settings are stored by slot, because a slot outlives a cook: the entry
 * the user configured last weekend has to survive a smoke profile that renames
 * every probe. Every name the user reads — in the settings rows and in the
 * notification text — is therefore resolved here, at read and send time, from
 * the active session's smoke profile.
 */
import { SmokeProfile } from '../smokeProfile/smokeProfile.schema';
import {
  ApplicationSettings,
  ProbeTargetAlertSettings,
  ProbeTargetEntry,
} from './app-settings.schema';

/** The smoker's meat probe slots, in the order the hardware reports them. */
export const PROBE_SLOTS = ['probe1', 'probe2', 'probe3'] as const;

export type ProbeSlot = (typeof PROBE_SLOTS)[number];

/** A display name per probe slot. */
export type ProbeNames = Record<string, string>;

/**
 * What a slot is called when nothing has named it: no active session, or a
 * profile whose field for this slot was left blank.
 */
export const genericProbeName = (slot: ProbeSlot): string =>
  `Probe ${slot.slice('probe'.length)}`;

/** The smoke profile field carrying a slot's name. */
const profileField = (slot: ProbeSlot): keyof SmokeProfile =>
  `${slot}Name` as keyof SmokeProfile;

/**
 * The placeholder `SmokeProfileService.getCurrentSmokeProfile` answers with when
 * a cook has a smoke but no smoke profile saved against it yet — the window
 * between starting from pre-smoke and reaching the smoke step.
 *
 * It is a placeholder rather than a name the user chose, so it counts as
 * unresolved: otherwise settings rows and notification text would read `Probe1`
 * for that whole window instead of this feature's own `Probe 1`.
 */
const unsavedProfilePlaceholder = (slot: ProbeSlot): string =>
  `Probe${slot.slice('probe'.length)}`;

/**
 * The names to use for this cook. A field falls back to the slot's generic label
 * when it is blank, when the profile is absent entirely (there is no active
 * session), or when it still holds the profile service's own placeholder — so a
 * notification always names something a person chose or a label they can read.
 */
export const resolveProbeNames = (
  profile: Partial<SmokeProfile> | null | undefined,
): ProbeNames =>
  PROBE_SLOTS.reduce<ProbeNames>((names, slot) => {
    const stored = profile?.[profileField(slot)];
    const named = typeof stored === 'string' ? stored.trim() : '';
    const unresolved =
      named === '' || named === unsavedProfilePlaceholder(slot);
    names[slot] = unresolved ? genericProbeName(slot) : named;
    return names;
  }, {});

/** A probe entry as the settings page reads it: the stored row, plus its name. */
export type ResolvedProbeTargetEntry = ProbeTargetEntry & { name: string };

/**
 * The Probe Target Reached alert as it is served for display.
 *
 * The names ride along on the read only. They are not part of the document the
 * user saves — the save DTO rejects them — because a name belongs to the cook,
 * not to the setting.
 */
export interface ResolvedProbeTargetAlertSettings
  extends Omit<ProbeTargetAlertSettings, 'probes'> {
  probes: ResolvedProbeTargetEntry[];
}

export interface ResolvedApplicationSettings
  extends Omit<ApplicationSettings, 'probeTarget'> {
  probeTarget: ResolvedProbeTargetAlertSettings;
}

/** The settings, with each probe row named for the cook the names came from. */
export const withResolvedProbeNames = (
  settings: ApplicationSettings,
  names: ProbeNames,
): ResolvedApplicationSettings => ({
  ...settings,
  probeTarget: {
    ...settings.probeTarget,
    probes: settings.probeTarget.probes.map((probe) => ({
      slot: probe.slot,
      enabled: probe.enabled,
      target: probe.target,
      name: names[probe.slot] ?? probe.slot,
    })),
  },
});
