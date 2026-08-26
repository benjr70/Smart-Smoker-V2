/**
 * The cook log of a finished smoke: everything the pitmaster did, in the order
 * they did it, with the one entry that should not have been logged removable.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CookEvent } from '../../../api/types';
import { DesignSurface, appTheme } from '../../../theme';
import { CookLogSection } from './CookLogSection';

const event = (id: string, hour: number, rest: Partial<CookEvent> = {}): CookEvent => ({
  _id: id,
  smokeId: 'smoke-7',
  stampKey: 'wood',
  label: 'Added Wood',
  tone: 'amber',
  at: new Date(2026, 7, 25, hour, 30),
  chamberTemp: 243,
  probe1Temp: 150,
  probe2Temp: null,
  probe3Temp: null,
  ...rest,
});

const showLog = (events: CookEvent[], onRemove = jest.fn().mockResolvedValue(true)) => {
  render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <CookLogSection events={events} onRemove={onRemove} />
      </DesignSurface>
    </CssVarsProvider>
  );
  return onRemove;
};

describe('the cook log section', () => {
  it('lists what was done, oldest first, with the pit and the clock', () => {
    showLog([
      event('event-2', 14, { stampKey: 'wrap', label: 'Wrapped', tone: 'p1', chamberTemp: 251 }),
      event('event-1', 12),
    ]);

    const rows = screen.getAllByTestId('cook-log-entry');
    expect(rows.map(row => row.textContent)).toEqual([
      expect.stringContaining('Added Wood'),
      expect.stringContaining('Wrapped'),
    ]);
    expect(rows[0]).toHaveTextContent('243°');
    expect(rows[0]).toHaveTextContent(
      new Date(2026, 7, 25, 12, 30).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })
    );
  });

  it('says nothing at all about a cook nothing was logged on', () => {
    showLog([]);

    expect(screen.queryByTestId('review-cook-log-section')).toBeNull();
  });

  it('removes the entry the reader crossed out', async () => {
    const onRemove = showLog([event('event-1', 12)]);

    await userEvent.click(screen.getByRole('button', { name: 'Remove Added Wood' }));

    expect(onRemove).toHaveBeenCalledWith('event-1');
  });

  /**
   * A cross that stays live while its own removal is still in the air invites a
   * second tap, and the second removal of an entry that is already gone comes
   * back as a failure — the reader is told the removal did not work about a
   * removal that plainly did.
   */
  it('will not send the same removal twice while the first is still in the air', async () => {
    let finish = (removed: boolean): void => void removed;
    const onRemove = showLog(
      [event('event-1', 12)],
      jest.fn().mockReturnValue(
        new Promise<boolean>(resolve => {
          finish = resolve;
        })
      )
    );
    const cross = screen.getByRole('button', { name: 'Remove Added Wood' });

    await userEvent.click(cross);
    expect(cross).toBeDisabled();
    // Fired rather than clicked: a disabled cross refuses a real tap, which is
    // the whole of the guard, so the second one is put straight at it.
    fireEvent.click(cross);

    expect(onRemove).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish(true);
    });
  });

  it('reads a pit that recorded nothing as a dash', () => {
    showLog([event('event-1', 12, { chamberTemp: null })]);

    expect(screen.getByTestId('cook-log-entry')).toHaveTextContent('—');
  });
});
