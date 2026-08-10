import { useEffect, useRef, useState } from 'react';
import { ProbeTargets } from 'temperaturechart/src/chartGeometry';
import { ProbeTargetsResource, getDefaultApiClient } from '../../api';
import { NO_TARGETS, chartTargetsOf } from './chartTargets';

/** Where the touchscreen reads the configured targets from. */
export type ProbeTargetsReadPort = ProbeTargetsResource;

/**
 * The targets the touchscreen's chart draws: read when the panel is switched
 * on, and again whenever a cook starts.
 *
 * Those moments, and no others. A target is a decision made on a phone before
 * the meat goes on, so the panel picks up a change at the start of the next cook
 * — where it is still a change to what is about to be cooked, rather than a
 * dashed line that moves under an operator's eyes halfway through a brisket.
 * There is deliberately no live sync: the appliance is switched on for days at a
 * time, and a target that can move mid-cook is a target the readings on the
 * screen were not taken against.
 *
 * A panel switched on into a cook that is already running reads twice within the
 * same second: once for the switch-on, and once when the state it loads tells it
 * a cook is running, which it cannot tell from one being started. That is the
 * price of the rule being this short, and it is a request at boot rather than
 * one per cook. The development build, which mounts every screen twice, likewise
 * reads twice for the switch-on; the appliance does not ship that way.
 *
 * A read that fails leaves the chart with the targets it already had rather
 * than an error, including targets the read it overlapped with had already
 * fetched. The panel is the one screen with nowhere to go — no reload, no back
 * button, and a cook running — and a chart missing its dashed lines is a chart
 * that still shows the cook.
 */
export const useProbeTargets = (smoking: boolean, source?: ProbeTargetsReadPort): ProbeTargets => {
  const [targets, setTargets] = useState<ProbeTargets>(NO_TARGETS);

  // The appliance's own settings unless the screen was handed some. The client
  // behind them is built once, on first use, and hands back the same resource
  // every time — so this is a stable value to hang the read below off.
  const port = source ?? getDefaultApiClient().probeTargets;

  /**
   * Which cook the panel is on: nought for the one it was switched on into,
   * and one more for every cook started in front of it.
   *
   * The read below hangs off this number rather than off the smoking flag,
   * because the flag says whether a cook is running and what is wanted here is
   * the moment one begins. Working that out while rendering — rather than in the
   * effect that reads — is what keeps it honest under the development build,
   * which mounts every screen twice: an effect that both decides a cook has
   * started and reads for it makes that decision on the first of the two passes
   * and has nothing left to decide on the second, which is the mount the
   * operator ends up looking at. Derived here, it is a number the read is keyed
   * on rather than a decision the read has to make for itself.
   */
  const [lastSmoking, setLastSmoking] = useState(smoking);
  const [cookNumber, setCookNumber] = useState(0);
  if (lastSmoking !== smoking) {
    setLastSmoking(smoking);
    // A cook stopping is not a moment to read: nothing is being cooked to a
    // target, and the next cook's start is what picks any change up.
    if (smoking) setCookNumber(cook => cook + 1);
  }

  /**
   * Whether the screen is still on the panel. A read is a request to a box that
   * may be a house away, and the answer to one is worth nothing once the screen
   * that asked has gone.
   */
  const onScreen = useRef(true);
  useEffect(() => {
    onScreen.current = true;
    return () => {
      onScreen.current = false;
    };
  }, []);

  /**
   * Which read is which: the number the next one is given, and the newest one
   * whose answer is on the chart.
   *
   * A read is not cancelled by the one after it, because a panel switched on
   * into a running cook asks twice within the same second and either answer is
   * the settings — dropping the first would leave the chart bare for the whole
   * cook if the second fails, which is the one thing this hook promises not to
   * do. Newer still beats older: a cook is started against the settings as they
   * stand, so a slow switch-on read wandering in behind the cook's own read is
   * an answer about a target the operator has already moved on from, and is let
   * go rather than drawn.
   */
  const nextRead = useRef(0);
  const drawnRead = useRef(-1);

  useEffect(() => {
    const readNumber = nextRead.current;
    nextRead.current += 1;
    void port
      .get()
      .then(probes => {
        // The screen may have moved on — to the wifi screen, or off the panel
        // altogether — while the settings were being read.
        if (!onScreen.current) return;
        // A read overtaken by a newer one that is already drawn is history.
        if (readNumber < drawnRead.current) return;
        drawnRead.current = readNumber;
        setTargets(chartTargetsOf(probes));
      })
      .catch(() => undefined);
  }, [cookNumber, port]);

  return targets;
};
