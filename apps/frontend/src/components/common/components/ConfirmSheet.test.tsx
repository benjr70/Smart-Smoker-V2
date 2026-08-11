/**
 * The confirmation bottom sheet: what it asks, and every way out of it.
 *
 * The ways out are the point of the component — a sheet that only closes
 * through its own buttons traps a phone user who tapped the trash by accident,
 * which is the exact accident the sheet exists to catch.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { DesignSurface, appTheme } from '../../../theme';
import { ConfirmSheet } from './ConfirmSheet';

const showSheet = (open = true) => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();

  render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <ConfirmSheet
          open={open}
          title="Delete this smoke?"
          confirmLabel="Delete smoke"
          cancelLabel="Keep it"
          onConfirm={onConfirm}
          onCancel={onCancel}
        >
          Sunday Brisket will be removed.
        </ConfirmSheet>
      </DesignSurface>
    </CssVarsProvider>
  );

  return { onConfirm, onCancel };
};

describe('the confirmation sheet', () => {
  it('asks its question and confirms when the confirming button is pressed', async () => {
    const { onConfirm, onCancel } = showSheet();

    const sheet = screen.getByRole('dialog', { name: 'Delete this smoke?' });
    expect(sheet).toHaveTextContent('Sunday Brisket will be removed.');

    await userEvent.click(screen.getByRole('button', { name: 'Delete smoke' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('declines when the declining button is pressed', async () => {
    const { onConfirm, onCancel } = showSheet();

    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('declines when Escape is pressed', async () => {
    const { onConfirm, onCancel } = showSheet();

    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('declines when the screen behind it is tapped', async () => {
    const { onConfirm, onCancel } = showSheet();

    await userEvent.click(screen.getByTestId('confirm-sheet-backdrop'));

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('is not on the screen at all while it is closed', () => {
    showSheet(false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Sunday Brisket will be removed.')).not.toBeInTheDocument();
  });
});
