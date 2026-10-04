import { Dispatch, SetStateAction, useMemo, useRef } from 'react';
import type { ScreenBinding } from './session';

/**
 * A screen's binding over the state it already keeps its form in: the values
 * are read as they are at the moment of asking, and a set of changes is
 * written through the screen's own setter — the same one typing goes through,
 * so a filled value is saved exactly as a typed one is. The undo it returns
 * puts back what those fields held when they were written, in each field that
 * still holds what was written to it.
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
        const fields = Object.keys(write) as (keyof Values)[];
        const before: Partial<Values> = {};
        fields.forEach(field => {
          before[field] = latest.current[field];
        });
        setter.current(current => ({ ...current, ...write }));
        // Undo takes back what was written, and only where it still stands. A
        // field given another value since — by the screen's own load landing
        // after the fill, or by the cook's hand — holds nothing of the fill's
        // any more, and putting back what it held before would overwrite that
        // value with one older than it.
        return () =>
          setter.current(current => {
            const restored = { ...current };
            fields.forEach(field => {
              if (current[field] === write[field]) {
                restored[field] = before[field] as Values[keyof Values];
              }
            });
            return restored;
          });
      },
    }),
    []
  );
};
