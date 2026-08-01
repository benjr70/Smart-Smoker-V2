/**
 * The load-on-mount / save-latest-on-unmount hook.
 *
 * Replaces the copy-pasted "ref plus two effects" choreography that form
 * components used to carry: it loads the current resource when the component
 * mounts, tracks the newest edited value in a ref, and saves that value when the
 * component unmounts. Failures keep the safe defaults / current value in place
 * and raise the app-root error snackbar instead of failing silently.
 *
 * The unmount save is skipped when the value still matches what the backend
 * last gave us, because a form the user never touched has nothing to persist.
 * That is not merely an optimization: the pre-smoke defaults carry no weight,
 * which the strict `PreSmokeDto` edge rejects, so an unconditional save made
 * "cold-start the app, walk away from the Pre-Smoke step" raise
 * "Could not save pre-smoke details." for every user on every fresh launch.
 *
 * Returns the familiar `[state, setState]` pair, so a migrating component swaps
 * its `useState` + two `useEffect`s for a single call and leaves every downstream
 * setter untouched.
 */
import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { useApiClient } from './ApiClientProvider';
import { ApiClient } from './client';
import { useApiSnackbar } from './SnackbarProvider';

export interface UseCurrentResourceOptions<T> {
  /** The value the component renders until (and unless) a load succeeds. */
  initialValue: T;
  /** Reads the current resource. A `null`/`undefined` result keeps the defaults. */
  load: (client: ApiClient) => Promise<T | null | undefined>;
  /** Persists the latest value on unmount. */
  save: (client: ApiClient, value: T) => Promise<unknown>;
  /** Snackbar message shown when the load fails. */
  loadErrorMessage?: string;
  /** Snackbar message shown when the unmount save fails. */
  saveErrorMessage?: string;
}

/**
 * Structural equality over the JSON-shaped values these resources carry
 * (objects, arrays, primitives) — enough to answer "did the user change
 * anything?" without adding a utility dependency the repo does not have.
 *
 * Key order is irrelevant, and a missing key compares equal to an explicit
 * `undefined`: the form defaults omit `weight.weight` entirely while a loaded
 * document may carry it as `undefined`, and neither is an edit.
 */
export function isUnchanged(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => isUnchanged(item, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every(key => isUnchanged(left[key], right[key]));
}

export function useCurrentResource<T>(
  options: UseCurrentResourceOptions<T>
): [T, Dispatch<SetStateAction<T>>] {
  const client = useApiClient();
  const notify = useApiSnackbar();
  const [state, setState] = useState<T>(options.initialValue);

  // The mount effect must run exactly once, yet close over the freshest state,
  // callbacks and collaborators — so everything the teardown needs is mirrored
  // into refs updated on every render.
  const latest = useRef(state);
  latest.current = state;

  // The value the backend last agreed with: the initial defaults until a load
  // succeeds, then whatever that load returned. The unmount save is measured
  // against it, so an untouched form (and a form whose edits were reverted)
  // writes nothing.
  const baseline = useRef<T>(options.initialValue);

  const optionsRef = useRef(options);
  optionsRef.current = options;
  const clientRef = useRef(client);
  clientRef.current = client;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    let active = true;
    const { load, save, loadErrorMessage, saveErrorMessage } = optionsRef.current;

    load(clientRef.current)
      .then(result => {
        // Keep the safe defaults unless the load produced an actual resource.
        // `null`/`undefined` mean "no current resource yet"; an empty string is
        // the shape an empty-body 200 collapses to if it ever reaches here — none
        // are resources, so none should overwrite the initial value (which would
        // otherwise blank the form fields / crash on `state.field.subfield`).
        if (active && result !== null && result !== undefined && (result as unknown) !== '') {
          baseline.current = result;
          setState(result);
        }
      })
      .catch(() => {
        notifyRef.current(loadErrorMessage ?? 'Failed to load.');
      });

    return () => {
      active = false;
      // Nothing edited, nothing to save. Skipping keeps a cold start from
      // POSTing defaults the DTO cannot accept (and from creating an empty
      // pre-smoke document, plus its smoke session, on every app launch).
      if (isUnchanged(latest.current, baseline.current)) {
        return;
      }
      Promise.resolve()
        .then(() => save(clientRef.current, latest.current))
        .catch(() => {
          notifyRef.current(saveErrorMessage ?? 'Failed to save.');
        });
    };
    // Lifecycle effect: run once on mount, tear down on unmount. All mutable
    // inputs are read through refs, so no dependencies belong here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [state, setState];
}
