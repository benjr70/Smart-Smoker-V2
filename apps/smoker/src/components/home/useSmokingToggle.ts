/**
 * Lighting the smoker from the panel, guarded against re-polluting a cook the
 * backend already stopped.
 *
 * A cook whose readings dried up is stopped by the backend on its own, with its
 * finish backdated to the last real reading, and left as the current session so
 * the End Smoke wizard can still be walked on a phone. The panel is where the
 * *next* cook gets lit — often days later, often to grill burgers — and lighting
 * one over that session is exactly how the finished cook's series ends up with a
 * second cook appended to it.
 *
 * So the finish stamp is read before the flag is flipped: a stamped session is
 * asked about rather than lit, and the answer is either "finish it and start a
 * fresh session" — the one tap this hook composes out of the three calls the
 * wizard makes — or "leave it alone". An unstamped cook is lit exactly as it
 * always was, and putting a cook out is never guarded, because that cannot
 * pollute anything.
 */
import { useCallback, useRef, useState } from 'react';
import { SessionResource, TimelineResource, getDefaultApiClient } from '../../api';

/** Where the panel reads whether the current cook has already been finished. */
export type CurrentCookReadPort = Pick<TimelineResource, 'getCurrent'>;

/** The three calls the one-tap recovery is composed of. */
export type SessionRecoveryPort = Pick<SessionResource, 'finish' | 'clear' | 'startNew'>;

export interface SmokingToggle {
  /** Whether the question about the auto-stopped cook is on screen. */
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

export const useSmokingToggle = (
  smoking: boolean,
  toggleSmoking: () => Promise<void>,
  currentCook?: CurrentCookReadPort,
  session?: SessionRecoveryPort
): SmokingToggle => {
  const [prompting, setPrompting] = useState(false);
  const [working, setWorking] = useState(false);

  // The appliance's own backend unless the screen was handed ports of its own.
  const cookPort = currentCook ?? getDefaultApiClient().timeline;
  const sessionPort = session ?? getDefaultApiClient().session;

  // Everything the callbacks read goes through a ref: the panel is re-rendered
  // on every reading that arrives off the serial feed, and the control must not
  // be handed a new function each time.
  const state = useRef({ smoking, toggleSmoking, cookPort, sessionPort });
  state.current = { smoking, toggleSmoking, cookPort, sessionPort };

  const request = useCallback((): void => {
    if (state.current.smoking) {
      // Putting the cook out: nothing to guard, and nothing to ask.
      void state.current.toggleSmoking();
      return;
    }
    void state.current.cookPort
      .getCurrent()
      // A stamp the panel cannot read is not evidence of one: an unreachable
      // cloud leaves the control behaving exactly as it did before this guard
      // existed rather than refusing to light the smoker.
      .catch(() => null)
      .then(cook => {
        if (cook?.finishedAt) {
          setPrompting(true);
          return undefined;
        }
        return state.current.toggleSmoking();
      });
  }, []);

  const confirm = useCallback((): void => {
    setWorking(true);
    void (async () => {
      try {
        // The finish flow the phone's wizard runs, in its own order: archive the
        // cook — which keeps the backdated finish the auto-stop wrote — let the
        // state go of it, which also tells every screen watching, then create
        // the session that takes its place.
        await state.current.sessionPort.finish();
        await state.current.sessionPort.clear();
        // Resolves only once that session is the *current* one, which is what
        // makes the flip below act on a cook rather than on the gap the backend
        // leaves between creating a smoke and pointing the state at it. A flip
        // sent into that gap changes nothing and reports nothing, and the panel
        // would be left claiming a fire it never lit.
        await state.current.sessionPort.startNew();
        setPrompting(false);
        // The cook the operator asked for in the first place, on a session that
        // can honestly record it.
        await state.current.toggleSmoking();
      } catch {
        // The prompt stays up: the previous cook has not been finished, so the
        // choice it offers is still the one to make, and the panel has nowhere
        // else to say so.
      } finally {
        setWorking(false);
      }
    })();
  }, []);

  const dismiss = useCallback((): void => setPrompting(false), []);

  return { prompting, working, request, confirm, dismiss };
};
