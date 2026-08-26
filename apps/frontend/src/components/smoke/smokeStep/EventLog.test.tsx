import '@testing-library/jest-dom';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CookEvent } from '../../../api';
import { DesignSurface } from '../../../theme';
import { EventLog } from './EventLog';

const event = (over: Partial<CookEvent> = {}): CookEvent => ({
  _id: 'event-1',
  smokeId: 'smoke-1',
  stampKey: 'wood',
  label: 'Added Wood',
  tone: 'amber',
  at: new Date(2026, 7, 25, 12, 0),
  chamberTemp: 243,
  probe1Temp: 162,
  probe2Temp: null,
  probe3Temp: null,
  ...over,
});

const renderLog = (props: Partial<React.ComponentProps<typeof EventLog>> = {}) =>
  render(
    <DesignSurface>
      <EventLog
        events={[]}
        smoking={true}
        onRecord={jest.fn().mockResolvedValue(true)}
        onRemove={jest.fn().mockResolvedValue(true)}
        {...props}
      />
    </DesignSurface>
  );

describe('the cook log card', () => {
  it('offers the six default stamps as buttons', () => {
    renderLog();

    ['Added Wood', 'Wrapped', 'Spritzed', 'Vent', 'Lid Open', 'Sauced'].forEach(label => {
      expect(screen.getByRole('button', { name: label })).toBeEnabled();
    });
  });

  it('logs the stamp that was tapped', async () => {
    const onRecord = jest.fn().mockResolvedValue(true);
    renderLog({ onRecord });

    await userEvent.click(screen.getByRole('button', { name: 'Wrapped' }));

    expect(onRecord).toHaveBeenCalledWith('wrap');
  });

  it('flashes the tapped button so a gloved hand knows it registered', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderLog();

    await user.click(screen.getByRole('button', { name: 'Spritzed' }));

    await screen.findByText('Logged');
    // The flash is brief on purpose: the button has to be back to being a
    // button before the next thing the pitmaster does to the pit.
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    await waitFor(() => expect(screen.queryByText('Logged')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Spritzed' })).toBeInTheDocument();
    jest.useRealTimers();
  });

  it('says so when the tap never reached the backend', async () => {
    const onRecord = jest.fn().mockResolvedValue(false);
    renderLog({ onRecord });

    await userEvent.click(screen.getByRole('button', { name: 'Vent' }));

    // Never "Logged": a phantom entry is worse than a failure nobody can miss.
    await screen.findByText('Not logged');
    expect(screen.queryByText('Logged')).not.toBeInTheDocument();
  });

  it('disables every stamp while nothing is cooking', () => {
    renderLog({ smoking: false });

    ['Added Wood', 'Wrapped', 'Spritzed', 'Vent', 'Lid Open', 'Sauced'].forEach(label => {
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
    });
  });

  it('lists the whole log, newest first, with the pit as it was', () => {
    renderLog({
      events: [
        event(),
        event({
          _id: 'event-2',
          stampKey: 'wrap',
          label: 'Wrapped',
          tone: 'p1',
          at: new Date(2026, 7, 25, 13, 30),
          chamberTemp: 251,
        }),
      ],
    });

    const rows = screen.getAllByTestId('cook-event-row');
    expect(rows).toHaveLength(2);
    // Newest first: what just happened is what the pitmaster is looking for.
    expect(within(rows[0]).getByText('Wrapped')).toBeInTheDocument();
    expect(within(rows[0]).getByText(/251/)).toBeInTheDocument();
    expect(within(rows[1]).getByText('Added Wood')).toBeInTheDocument();
  });

  it('reads an event stamped before the pit reported anything as a dash', () => {
    renderLog({ events: [event({ chamberTemp: null })] });

    expect(within(screen.getByTestId('cook-event-row')).getByText('—')).toBeInTheDocument();
  });

  it('removes the event whose delete was tapped', async () => {
    const onRemove = jest.fn().mockResolvedValue(true);
    renderLog({ events: [event({ _id: 'event-7' })], onRemove });

    await userEvent.click(screen.getByRole('button', { name: /remove added wood/i }));

    expect(onRemove).toHaveBeenCalledWith('event-7');
  });

  it('says the log is empty rather than showing an empty box', () => {
    renderLog();

    expect(screen.getByText(/nothing logged yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('cook-event-row')).not.toBeInTheDocument();
  });
});
