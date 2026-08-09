import { ProbeTargets } from 'temperaturechart/src/chartGeometry';
import { ProbeTargetSetting } from '../../api';

/** No targets, as one value, so a chart handed "none" is not redrawn for it. */
export const NO_TARGETS: ProbeTargets = {};

/** The meat probes a target can be drawn for; the chamber has a range, not one. */
const TARGETABLE = ['probe1', 'probe2', 'probe3'] as const;

type TargetableSlot = (typeof TARGETABLE)[number];

const isTargetable = (slot: string): slot is TargetableSlot =>
  (TARGETABLE as readonly string[]).includes(slot);

/**
 * The targets the chart rules a dashed line for, out of the settings' probe
 * rows.
 *
 * A target is drawn for a probe that is being watched, and for no other. Every
 * row carries a temperature whether or not anybody chose it — an untouched row
 * reads 203, the default — so the number alone cannot say whether a target was
 * configured; the watch checkbox beside it in settings is what the operator
 * actually set. Drawing from the number would rule three dashed lines across
 * every cook on a smoker nobody has configured at all, and a panel in a garage
 * is the worst place to have to explain them.
 *
 * A row whose temperature is no temperature — a zero, or something that came
 * over the wire as neither — is passed on as it stands: the chart draws a
 * target only where there is one to draw, and re-deciding that here would be a
 * second rule to keep in step with it.
 *
 * The chamber's low/high range is not a target and is never drawn: it is a band
 * the fire is held inside, not a temperature anything is cooked to. It is not
 * even read this far — the panel asks the settings only for the probe rows.
 *
 * The web application decides the same thing for its own chart, in its own copy
 * of this (`apps/frontend/src/components/common/chartTargets.ts`), because
 * neither application imports the other's screens — so a change to what counts
 * as a configured target belongs in both.
 */
export const chartTargetsOf = (probes: ProbeTargetSetting[] | undefined): ProbeTargets => {
  const targets: ProbeTargets = {};
  (probes ?? []).forEach(probe => {
    // A row whose slot is not one of the three is a row for something this
    // chart has no line for; the chamber's is the one that exists, and its
    // range is not a target.
    if (!probe?.enabled || !isTargetable(probe.slot)) return;
    targets[probe.slot] = probe.target;
  });
  return targets;
};
