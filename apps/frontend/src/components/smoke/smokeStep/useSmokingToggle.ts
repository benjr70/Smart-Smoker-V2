/**
 * Lighting the smoker, guarded against re-polluting a cook that was already
 * stopped.
 *
 * A cook whose readings dried up is stopped by the backend on its own, with its
 * finish backdated to the last real reading — but the session stays current, so
 * the pitmaster can still walk the End Smoke wizard whenever they next open the
 * app. That leaves one way to lose the honest duration again: switching smoking
 * back on over that session, which would append the next cook's readings to the
 * finished one's series.
 *
 * So the finish stamp is read before the flag is flipped. A stamped cook is not
 * lit; it is asked about, and the answer is either "finish it and start a
 * fresh session" (the one tap this hook composes) or "leave everything alone".
 * An unstamped cook — every ordinary cook — is lit exactly as it always was.
 *
 * Stopping is never guarded: putting a cook out cannot pollute anything.
 */
import { useCallback, useRef, useState } from 'react';
import { PreSmoke, useApiClient, useApiSnackbar } from '../../../api';
import { WeightUnits } from '../../common/interfaces/enums';

/**
 * The pre-smoke a fresh session begins from: the blank document the wizard's
 * first step starts on. Saving one is what creates the next session — the
 * backend links a new smoke to the state on a pre-smoke save with no current
 * cook — so this is the "start a new session" half of the one-tap recovery.
 */
export const FRESH_PRE_SMOKE: PreSmoke = {
  name: '',
  meatType: '',
  weight: { unit: WeightUnits.LB },
  steps: [''],
  notes: '',
};

export interface SmokingToggle {
  /** Whether the prompt about the auto-stopped cook is on screen. */
  prompting: boolean;
  /** Whether the one-tap recovery is in flight. */
  working: boolean;
  /** Ask for the smoking flag to be flipped; may prompt instead. */
  request: () => void;
  /** Finish the auto-stopped cook, start a fresh session, and light it. */
  confirm: () => void;
  /** Leave the session, and the smoking flag, exactly as they are. */
  dismiss: () => void;
}

export function useSmokingToggle(
  smoking: boolean,
  toggleSmoking: () => Promise<void>
): SmokingToggle {
  const client = useApiClient();
  const notify = useApiSnackbar();
  const [prompting, setPrompting] = useState(false);
  const [working, setWorking] = useState(false);
  // Read through refs so the callbacks below keep one identity for the life of
  // the step: the control they are handed to is re-rendered by the session on
  // every reading that arrives.
  const clientRef = useRef(client);
  clientRef.current = client;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const toggleRef = useRef(toggleSmoking);
  toggleRef.current = toggleSmoking;
  const smokingRef = useRef(smoking);
  smokingRef.current = smoking;

  const request = useCallback((): void => {
    if (smokingRef.current) {
      // Putting the cook out: nothing to guard, and nothing to ask.
      void toggleRef.current();
      return;
    }
    void clientRef.current.timeline
      .getCurrent()
      // A stamp we cannot read is not evidence of one: a backend that is down,
      // or too old to answer, leaves the control behaving exactly as it did
      // before this guard existed rather than blocking the cook.
      .catch(() => null)
      .then(cook => {
        if (cook?.finishedAt) {
          setPrompting(true);
          return undefined;
        }
        return toggleRef.current();
      });
  }, []);

  const confirm = useCallback((): void => {
    setWorking(true);
    void (async () => {
      try {
        // The existing finish flow, in its own order: archive the cook — which
        // keeps the backdated finish the auto-stop wrote — then let the state
        // go of it, then create the session that takes its place.
        await clientRef.current.smoke.finish();
        await clientRef.current.state.clearSmoke();
        await clientRef.current.preSmoke.saveCurrent(FRESH_PRE_SMOKE);
        setPrompting(false);
        // The cook the user asked for in the first place, on the session that
        // can honestly record it.
        await toggleRef.current();
      } catch {
        // The prompt stays up: the previous cook has not been finished, so the
        // choice it offers is still the one to make.
        notifyRef.current('Could not finish the previous cook. Try again.');
      } finally {
        setWorking(false);
      }
    })();
  }, []);

  const dismiss = useCallback((): void => setPrompting(false), []);

  return { prompting, working, request, confirm, dismiss };
}
