import { ApplicationSettings } from '../appSettings/app-settings.schema';

/**
 * The temperature the cook was being taken to, as one number.
 *
 * The watch list is per probe and the detail screen shows a single target, so
 * one of them has to be the cook's. It is the first probe being watched, in
 * slot order — with one meat on the smoker that is the probe in it, and with
 * several it is the one the operator set up first.
 *
 * Whether the alert as a whole is switched on is not consulted: an operator who
 * turned the notification off still told the app what this meat is done at, and
 * that is what the finished cook is recorded as having aimed for. A cook where
 * no probe is watched aimed at nothing, and answers `null` rather than a
 * default that nobody chose.
 */
export const primaryWatchedTarget = (
  settings: ApplicationSettings,
): number | null =>
  settings.probeTarget.probes.find((probe) => probe.enabled)?.target ?? null;
