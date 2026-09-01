import { useEffect, useRef, useState } from 'react';
import { useApiClient } from '../../../api';
import { WeightUnits } from '../../common/interfaces/enums';

/** What the rest timer needs to know that is not on the cook itself. */
export interface RestConditions {
  /**
   * Whether the Serve Plan is switched on. Off means no rest timer anywhere —
   * the whole feature is one switch, and off is off.
   */
  enabled: boolean;
  /**
   * What the meat weighed, in pounds, or `null` where nobody weighed it. Read
   * from the pre-smoke entry of this cook, which is where the pitmaster already
   * put it, rather than asked for a second time on the way out.
   */
  weightLb: number | null;
}

/** What a pound is, in each of the units the pre-smoke step weighs meat in. */
const POUNDS_PER: Record<string, number> = {
  [WeightUnits.LB]: 1,
  [WeightUnits.OZ]: 1 / 16,
  [WeightUnits.KG]: 2.20462,
};

/**
 * A recorded weight in pounds, or `null` where there is nothing to convert.
 *
 * One unit, because the carryover is a claim about how big the cut is and a
 * threshold cannot be compared against three different scales. Pounds because
 * that is what the archive's statistics already normalize to.
 */
export const poundsOf = (weight?: { weight?: number; unit?: WeightUnits }): number | null => {
  const recorded = weight?.weight;
  if (recorded === undefined || recorded === null || !Number.isFinite(Number(recorded))) {
    return null;
  }
  return Number(recorded) * (POUNDS_PER[weight?.unit ?? WeightUnits.LB] ?? 1);
};

/**
 * The two things about the installation and the cut that the rest timer is
 * drawn with, read once when the step opens.
 *
 * A failure of either read leaves the shipped answer standing — the planner is
 * on, and the cut is unweighed — rather than taking the card down: the step
 * raises its own snackbar for the document it is editing, and a rest counting
 * from a stamped pull is still true when the settings could not be reached.
 */
export const useRestConditions = (): RestConditions => {
  const client = useApiClient();
  const clientRef = useRef(client);
  clientRef.current = client;
  const [conditions, setConditions] = useState<RestConditions>({
    enabled: true,
    weightLb: null,
  });

  useEffect(() => {
    let active = true;
    void Promise.all([
      clientRef.current.servePlan.get().catch(() => null),
      clientRef.current.preSmoke.getCurrent().catch(() => null),
    ]).then(([settings, preSmoke]) => {
      if (!active) {
        return;
      }
      setConditions({
        enabled: settings?.enabled ?? true,
        weightLb: poundsOf(preSmoke?.weight),
      });
    });
    return () => {
      active = false;
    };
  }, []);

  return conditions;
};
