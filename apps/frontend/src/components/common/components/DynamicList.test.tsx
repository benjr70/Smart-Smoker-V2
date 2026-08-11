/**
 * The numbered steps list, as the two wizard steps use it: a plan that can be
 * read, added to and taken from.
 *
 * The component is rendered for real, under the theme it draws from. The suite
 * this replaces mocked every Material-UI component it used and then asserted on
 * the stand-ins — `data-variant="outlined"`, the `addButton` class on the remove
 * control, "Fragment as root element" — so it passed whatever the list looked
 * like and failed whenever its markup was rearranged. None of that could see the
 * defect this slice fixes: that the last row carried the control which *adds* a
 * step where every other row carried the one that removes it.
 */
import '@testing-library/jest-dom';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { DesignSurface, appTheme } from '../../../theme';
import { DynamicList } from './DynamicList';

type ListProps = React.ComponentProps<typeof DynamicList>;

const renderList = (overrides: Partial<ListProps> = {}) => {
  const props: ListProps = {
    onListChange: jest.fn(),
    newline: jest.fn(),
    removeLine: jest.fn(),
    steps: ['Trim the fat', 'Dry brine overnight', 'Rub two hours ahead'],
    testIdPrefix: 'prep-steps',
    ...overrides,
  };

  return { props, ...render(withTheme(<DynamicList {...props} />)) };
};

const withTheme = (ui: JSX.Element): JSX.Element => (
  <CssVarsProvider theme={appTheme}>
    <DesignSurface>{ui}</DesignSurface>
  </CssVarsProvider>
);

const rows = () => screen.getAllByTestId('prep-steps-row');

describe('the steps list', () => {
  it('shows one row per step, holding what that step says', () => {
    renderList();

    expect(
      screen.getAllByTestId('prep-steps-input').map(field => (field as HTMLInputElement).value)
    ).toEqual(['Trim the fat', 'Dry brine overnight', 'Rub two hours ahead']);
  });

  it('numbers the rows in the order they will be worked through', () => {
    renderList();

    expect(rows().map(row => within(row).getByTestId('prep-steps-number').textContent)).toEqual([
      '1',
      '2',
      '3',
    ]);
  });

  it('reports an edited step by the position it holds', () => {
    const { props } = renderList();

    fireEvent.change(within(rows()[1]).getByTestId('prep-steps-input'), {
      target: { value: 'Dry brine for two days' },
    });

    expect(props.onListChange).toHaveBeenCalledWith('Dry brine for two days', 1);
  });

  it('grows by one row from the control under the list', () => {
    const { props } = renderList();

    fireEvent.click(screen.getByTestId('prep-steps-add-button'));

    expect(props.newline).toHaveBeenCalledTimes(1);
  });

  /**
   * The defect this list was rebuilt around: the add control used to live in the
   * last row, in the place every other row kept its remove control, so the final
   * step of a plan could not be dropped at all.
   */
  it('drops any row, including the last one', () => {
    const { props } = renderList();

    fireEvent.click(within(rows()[2]).getByTestId('prep-steps-remove-button'));

    expect(props.removeLine).toHaveBeenCalledWith(2);
  });

  it('names each remove control after the step it would drop', () => {
    renderList();

    expect(screen.getByRole('button', { name: 'Remove step 2' })).toBe(
      within(rows()[1]).getByTestId('prep-steps-remove-button')
    );
  });

  it('offers to start an emptied list again', () => {
    const { props } = renderList({ steps: [] });

    expect(screen.queryByTestId('prep-steps-row')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('prep-steps-add-button'));

    expect(props.newline).toHaveBeenCalledTimes(1);
  });

  /**
   * A step whose resource has not loaded yet hands the list nothing at all,
   * which is not the same thing as an empty plan and must not throw.
   */
  it('shows nothing rather than failing when it has no steps to show', () => {
    renderList({ steps: undefined as unknown as string[] });

    expect(screen.queryByTestId('prep-steps-row')).not.toBeInTheDocument();
  });

  it('keeps two lists rendered together separately addressable', () => {
    render(
      withTheme(
        <>
          <DynamicList
            onListChange={jest.fn()}
            newline={jest.fn()}
            removeLine={jest.fn()}
            steps={['Trim the fat']}
            testIdPrefix="prep-steps"
          />
          <DynamicList
            onListChange={jest.fn()}
            newline={jest.fn()}
            removeLine={jest.fn()}
            steps={['Slice against the grain']}
            testIdPrefix="rest-steps"
          />
        </>
      )
    );

    expect(screen.getByTestId('prep-steps-input')).toHaveValue('Trim the fat');
    expect(screen.getByTestId('rest-steps-input')).toHaveValue('Slice against the grain');
    expect(screen.getByTestId('prep-steps-row')).not.toBe(screen.getByTestId('rest-steps-row'));
  });
});
