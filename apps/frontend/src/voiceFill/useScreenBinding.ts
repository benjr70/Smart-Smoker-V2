import { Dispatch, SetStateAction, useMemo, useRef } from 'react';
import type { ScreenBinding } from './session';

/**
 * A screen's binding over the state it already keeps its form in: the values
 * are read as they are at the moment of asking, and a set of changes is
 * written through the screen's own setter — the same one typing goes through,
 * so a filled value is saved exactly as a typed one is. The undo it returns
 * puts back what those fields held when they were written.
 *
 * The binding is one object for the life of the screen, however often the
 * screen renders.
 */
export const useScreenBinding = <Values extends object>(
  state: Values,
  setState: Dispatch<SetStateAction<Values>>
): ScreenBinding<Values> => {
  const latest = useRef(state);
  latest.current = state;
  const setter = useRef(setState);
  setter.current = setState;

  return useMemo(
    () => ({
      values: () => latest.current,
      apply: write => {
        const before: Partial<Values> = {};
        (Object.keys(write) as (keyof Values)[]).forEach(field => {
          before[field] = latest.current[field];
        });
        setter.current(current => ({ ...current, ...write }));
        return () => setter.current(current => ({ ...current, ...before }));
      },
    }),
    []
  );
};
