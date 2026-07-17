/**
 * The load-on-mount / save-latest-on-unmount hook.
 *
 * Replaces the copy-pasted "ref plus two effects" choreography that form
 * components used to carry: it loads the current resource when the component
 * mounts, tracks the newest edited value in a ref, and saves that value when the
 * component unmounts. Failures keep the safe defaults / current value in place
 * and raise the app-root error snackbar instead of failing silently.
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
          setState(result);
        }
      })
      .catch(() => {
        notifyRef.current(loadErrorMessage ?? 'Failed to load.');
      });

    return () => {
      active = false;
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
