import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import type { PreSmoke } from '../api/types';
import { WeightUnits } from '../components/common/interfaces/enums';
import { useScreenBinding } from './useScreenBinding';

const defaults: PreSmoke = {
  name: '',
  meatType: '',
  weight: { unit: WeightUnits.LB },
  steps: [''],
  notes: '',
};

const loaded: PreSmoke = {
  name: 'Sunday brisket',
  meatType: 'Brisket',
  weight: { weight: 14, unit: WeightUnits.LB },
  steps: ['Trim', 'Rub'],
  notes: 'From the good butcher.',
};

/** A screen keeping its form in state, with Voice Fill's binding over it. */
const useScreen = (initial: PreSmoke) => {
  const [form, setForm] = useState(initial);
  return { form, setForm, binding: useScreenBinding(form, setForm) };
};

describe('a screen binding', () => {
  test('writes the changes through the screen setter and undoes exactly those', () => {
    const { result } = renderHook(() => useScreen(loaded));

    let undo = (): void => undefined;
    act(() => {
      undo = result.current.binding.apply({ meatType: 'Ribs', steps: ['Trim', 'Rub', 'Wrap'] });
    });
    expect(result.current.form).toEqual({
      ...loaded,
      meatType: 'Ribs',
      steps: ['Trim', 'Rub', 'Wrap'],
    });
    expect(result.current.binding.values()).toBe(result.current.form);

    act(() => undo());
    expect(result.current.form).toEqual(loaded);
  });

  test('is one object however often the screen renders', () => {
    const { result, rerender } = renderHook(() => useScreen(loaded));
    const first = result.current.binding;

    rerender();

    expect(result.current.binding).toBe(first);
  });

  test('undo leaves alone a document that loaded over the fill', () => {
    // The fill beat the screen's own load: it was written over the defaults.
    const { result } = renderHook(() => useScreen(defaults));
    let undo = (): void => undefined;
    act(() => {
      undo = result.current.binding.apply({
        meatType: 'Ribs',
        weight: { weight: 16, unit: WeightUnits.LB },
        steps: ['Wrap'],
      });
    });

    // The load lands, and replaces the form with the document the backend holds.
    act(() => result.current.setForm(loaded));
    act(() => undo());

    // Nothing of the defaults the fill was written over comes back.
    expect(result.current.form).toEqual(loaded);
  });

  test('undo keeps what the cook typed into a filled field afterwards, and takes back the rest', () => {
    const { result } = renderHook(() => useScreen(loaded));
    let undo = (): void => undefined;
    act(() => {
      undo = result.current.binding.apply({ meatType: 'Ribs', notes: 'Spoken notes.' });
    });

    act(() => result.current.setForm(form => ({ ...form, notes: 'Typed notes.' })));
    act(() => undo());

    expect(result.current.form).toEqual({ ...loaded, notes: 'Typed notes.' });
  });
});
