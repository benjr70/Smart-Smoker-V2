/**
 * The cook picker: how a pitmaster finds a cook they only half remember, and
 * every way back out of the sheet.
 *
 * What is worth asserting here is what the user can do — type a fragment and
 * see the archive narrow, press a pill and see it reorder, press the cook
 * already in the other slot and have nothing happen — rather than which state
 * the component keeps to do it.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { SmokeHistory } from '../../../api/types';
import { DesignSurface, appTheme, carbonLight } from '../../../theme';
import { CookPickerSheet } from './CookPickerSheet';

const cook = (fields: Partial<SmokeHistory> & { smokeId: string }): SmokeHistory => ({
  name: 'A cook',
  meatType: 'Beef',
  weight: '12',
  weightUnit: 'LB',
  woodType: 'Hickory',
  date: 'Aug 1, 2026',
  overAllRating: '7',
  durationMs: 45000000,
  notes: [],
  ...fields,
});

const archive: SmokeHistory[] = [
  cook({
    smokeId: 'brisket',
    name: 'Backyard brisket',
    meatType: 'Beef',
    woodType: 'Oak',
    date: 'Aug 1, 2026',
    overAllRating: '8.5',
  }),
  cook({
    smokeId: 'pork',
    name: 'Pulled pork',
    meatType: 'Pork',
    weight: '8',
    woodType: 'Cherry',
    date: 'Jul 4, 2026',
    overAllRating: '6',
    durationMs: 32400000,
  }),
  cook({
    smokeId: 'ribs',
    name: 'Baby backs',
    meatType: 'Pork',
    woodType: 'Hickory',
    date: 'Jun 12, 2026',
    overAllRating: '9',
    durationMs: 18000000,
  }),
];

const showPicker = (props: Partial<React.ComponentProps<typeof CookPickerSheet>> = {}) => {
  const onPick = jest.fn();
  const onClose = jest.fn();

  render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <CookPickerSheet
          open
          side="A"
          cooks={archive}
          selectedId="brisket"
          otherId="pork"
          onPick={onPick}
          onClose={onClose}
          {...props}
        />
      </DesignSurface>
    </CssVarsProvider>
  );

  return { onPick, onClose };
};

/** The cooks the sheet is offering, in the order it offers them. */
const offered = (): string[] =>
  screen.getAllByTestId('cook-picker-row').map(row => row.getAttribute('data-smoke-id') ?? '');

const rowFor = (name: string): HTMLElement =>
  screen.getByRole('button', { name: new RegExp(`^Pick ${name}`) });

describe('the cook picker sheet', () => {
  test('says which slot is being filled, and how much of the archive is in view', async () => {
    showPicker();

    expect(screen.getByTestId('cook-picker')).toHaveTextContent('PICK COOK A');
    expect(screen.getByTestId('cook-picker-count')).toHaveTextContent('3 of 3 sessions');

    // The count is live: it answers "did my search work" while it is typed.
    await userEvent.type(screen.getByRole('searchbox'), 'pulled');

    expect(screen.getByTestId('cook-picker-count')).toHaveTextContent('1 of 3 sessions');
  });

  test('the slot being filled is the one the sheet was opened for', () => {
    showPicker({ side: 'B' });

    expect(screen.getByTestId('cook-picker')).toHaveTextContent('PICK COOK B');
  });

  /**
   * A row has to be enough to recognise a cook by without its name, because the
   * name is the thing the pitmaster came here not remembering.
   */
  test('a row states the cook, when it ran, what was in it, and how it scored', () => {
    showPicker();

    const row = rowFor('Pulled pork');
    expect(row).toHaveTextContent('Jul 4, 2026');
    expect(row).toHaveTextContent('8 LB Pork');
    expect(row).toHaveTextContent('Cherry');
    expect(row).toHaveTextContent('9h 00m');
    expect(within(row).getByTestId('cook-picker-score')).toHaveTextContent('6.0');
  });

  /**
   * A row is chosen by its facts, not by its name — that is why the facts are
   * on it. A button named after the cook alone hands a screen-reader user the
   * list of names they came here not remembering.
   */
  test('a row is announced by the facts it is recognised by, not by its name alone', () => {
    showPicker();

    expect(rowFor('Pulled pork')).toHaveAccessibleName(
      'Pick Pulled pork, Jul 4, 2026, 8 LB Pork, Cherry, 9h 00m, overall taste 6.0 out of 10, already in the other slot'
    );
    expect(rowFor('Backyard brisket')).toHaveAccessibleName(
      'Pick Backyard brisket, Aug 1, 2026, 12 LB Beef, Oak, 12h 30m, overall taste 8.5 out of 10, currently chosen'
    );
  });

  test('a cook nobody rated is announced as unrated rather than as a zero', () => {
    showPicker({
      cooks: [cook({ smokeId: 'legacy', name: 'Old cook', durationMs: null, overAllRating: '' })],
      selectedId: undefined,
      otherId: undefined,
    });

    expect(rowFor('Old cook')).toHaveAccessibleName(
      'Pick Old cook, Aug 1, 2026, 12 LB Beef, Hickory, —, not rated'
    );
  });

  test('a cook with nothing on record reads as absent rather than as zero', () => {
    showPicker({
      cooks: [cook({ smokeId: 'legacy', name: 'Old cook', durationMs: null, overAllRating: '' })],
      selectedId: undefined,
      otherId: undefined,
    });

    const row = rowFor('Old cook');
    expect(row).toHaveTextContent('—');
    expect(within(row).getByTestId('cook-picker-score')).toHaveTextContent('—');
  });

  test('the search narrows the offered cooks', async () => {
    showPicker();

    await userEvent.type(screen.getByRole('searchbox'), 'cherry');

    expect(offered()).toEqual(['pork']);
  });

  test('a sort pill reorders the offered cooks', async () => {
    showPicker();

    expect(offered()).toEqual(['brisket', 'pork', 'ribs']);

    await userEvent.click(screen.getByRole('button', { name: 'Top rated' }));
    expect(offered()).toEqual(['ribs', 'brisket', 'pork']);

    await userEvent.click(screen.getByRole('button', { name: 'A–Z' }));
    expect(offered()).toEqual(['ribs', 'brisket', 'pork']);

    await userEvent.click(screen.getByRole('button', { name: 'Recent' }));
    expect(offered()).toEqual(['brisket', 'pork', 'ribs']);
  });

  test('a meat chip is offered for every meat in the archive, and narrows to it', async () => {
    showPicker();

    await userEvent.click(screen.getByRole('button', { name: 'Beef' }));

    expect(offered()).toEqual(['brisket']);
    expect(screen.getByRole('button', { name: 'Beef' })).toHaveAttribute('aria-pressed', 'true');
  });

  /** Search, sort and chips are three narrowings of one list, not three lists. */
  test('the search, the sort and the chips all apply at once', async () => {
    showPicker();

    await userEvent.click(screen.getByRole('button', { name: 'Pork' }));
    await userEvent.click(screen.getByRole('button', { name: 'Top rated' }));
    expect(offered()).toEqual(['ribs', 'pork']);

    await userEvent.type(screen.getByRole('searchbox'), 'cherry');
    expect(offered()).toEqual(['pork']);
  });

  test('a narrowing that matches nothing says so', async () => {
    showPicker();

    await userEvent.type(screen.getByRole('searchbox'), 'lamb');

    expect(screen.queryAllByTestId('cook-picker-row')).toHaveLength(0);
    expect(screen.getByTestId('cook-picker-empty')).toHaveTextContent('No cooks match');
  });

  /**
   * A cook cannot be compared against itself, so the one in the other slot is
   * shown — the pitmaster should see where it went — but cannot be chosen.
   */
  test('the cook in the other slot is marked in use and cannot be picked', async () => {
    const { onPick } = showPicker();

    const row = rowFor('Pulled pork');
    expect(row).toHaveTextContent('IN USE');
    expect(row).toBeDisabled();

    await userEvent.click(row);

    expect(onPick).not.toHaveBeenCalled();
  });

  test('the cook already in this slot is marked as the current choice', () => {
    showPicker();

    const chosen = rowFor('Backyard brisket');
    expect(within(chosen).getByTestId('cook-picker-check')).toBeInTheDocument();
    expect(chosen).toHaveStyle({ borderColor: carbonLight.accent });

    const other = rowFor('Baby backs');
    expect(within(other).queryByTestId('cook-picker-check')).toBeNull();
    expect(other).toHaveStyle({ borderColor: carbonLight.border });
  });

  test('picking a cook reports it and closes the sheet', async () => {
    const { onPick, onClose } = showPicker();

    await userEvent.click(rowFor('Baby backs'));

    expect(onPick).toHaveBeenCalledWith('ribs');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test.each([
    [
      'the close control',
      async () => userEvent.click(screen.getByRole('button', { name: 'Close' })),
    ],
    ['the scrim', async () => userEvent.click(screen.getByTestId('cook-picker-backdrop'))],
    ['Escape', async () => userEvent.keyboard('{Escape}')],
  ])('%s dismisses the sheet without picking anything', async (_way, dismiss) => {
    const { onPick, onClose } = showPicker();

    await dismiss();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  /**
   * The sheet is driven with one thumb at a party: a row is big enough to hit
   * without aiming, and so is every control above the list.
   */
  test('every row and control is big enough for a thumb', () => {
    showPicker();

    screen
      .getAllByTestId('cook-picker-row')
      .forEach(row => expect(row).toHaveStyle({ minHeight: '72px' }));
    expect(screen.getByRole('button', { name: 'Close' })).toHaveStyle({ height: '44px' });
    screen
      .getAllByTestId('cook-picker-pill')
      .forEach(pill => expect(pill).toHaveStyle({ minHeight: '44px' }));
  });

  test('a closed sheet is not on the screen at all', () => {
    showPicker({ open: false });

    expect(screen.queryByTestId('cook-picker')).toBeNull();
  });
});
