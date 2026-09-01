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
 * The switch is answered before the card is drawn, not guessed at: `enabled`
 * starts false and only a read that came back says otherwise. A read that never
 * came back is not permission to render the feature — a pitmaster who switched
 * the Serve Plan off would get the card anyway on the first 5xx — and starting
 * from the shipped default would flash the card onto every open before the
 * answer arrives. The route answers with the shipped plan for a deployment that
 * never touched it, so waiting costs a switched-on installation nothing but the
 * round trip.
 *
 * The weight is different: it only scales the carryover, so a pre-smoke that
 * could not be read is treated as the unweighed cook it might as well be, and
 * the countdown stands.
 */
export const useRestConditions = (): RestConditions => {
  const client = useApiClient();
  const clientRef = useRef(client);
  clientRef.current = client;
  const [conditions, setConditions] = useState<RestConditions>({
    enabled: false,
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
        enabled: settings?.enabled ?? false,
        weightLb: poundsOf(preSmoke?.weight),
      });
    });
    return () => {
      active = false;
    };
  }, []);

  return conditions;
};
