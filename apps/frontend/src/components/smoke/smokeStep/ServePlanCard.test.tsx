import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ServePlanStatus } from '../../../api';
import { DesignSurface } from '../../../theme';
import { ServePlanCard } from './ServePlanCard';

/**
 * A plan the backend has already judged. Every test states the verdict and the
 * slack it was judged with — the card renders them and derives neither, so a
 * plan whose numbers disagree with its verdict is a legitimate fixture: it
 * proves the card is reading the verdict rather than working one out.
 */
const plan = (over: Partial<ServePlanStatus> = {}): ServePlanStatus => ({
  serveAt: new Date(2026, 7, 1, 18, 0),
  restMinutes: 30,
  pullBy: new Date(2026, 7, 1, 17, 30),
  slackMinutes: 20,
  verdict: 'ontrack',
  milestones: [
    { kind: 'pullBy', at: new Date(2026, 7, 1, 17, 30), temp: null },
    { kind: 'restUntil', at: new Date(2026, 7, 1, 18, 0), temp: null },
  ],
  ...over,
});

const renderCard = (props: Partial<React.ComponentProps<typeof ServePlanCard>> = {}) =>
  render(
    <DesignSurface>
      <ServePlanCard
        plan={plan()}
        onServeAtChange={jest.fn()}
        onRestChange={jest.fn()}
        {...props}
      />
    </DesignSurface>
  );

describe('the serve plan card', () => {
  test('says the cook is on schedule, and by how much', () => {
    renderCard({ plan: plan({ verdict: 'ontrack', slackMinutes: 20 }) });

    expect(screen.getByTestId('serve-plan-headline')).toHaveTextContent('On schedule · 20m spare');
  });

  test('says which way a cook still inside the tolerance is running', () => {
    // Late, but by less than the user calls off plan: the backend still calls
    // it on schedule, and the card says how much of the cushion has gone.
    renderCard({ plan: plan({ verdict: 'ontrack', slackMinutes: -10 }) });

    expect(screen.getByTestId('serve-plan-headline')).toHaveTextContent('On schedule · 10m behind');
    expect(screen.queryByTestId('serve-plan-off-plan')).not.toBeInTheDocument();
  });

  test('says how late a cook running behind is, and what to do about it', () => {
    renderCard({ plan: plan({ verdict: 'behind', slackMinutes: -35 }) });

    expect(screen.getByTestId('serve-plan-headline')).toHaveTextContent('Running 35m late');
    expect(screen.getByTestId('serve-plan-advice')).toHaveTextContent(
      'Raise the pit or shorten the rest'
    );
  });

  test('says how much cushion a cook that is early has', () => {
    renderCard({ plan: plan({ verdict: 'early', slackMinutes: 65 }) });

    expect(screen.getByTestId('serve-plan-headline')).toHaveTextContent('1h 05m of cushion');
  });

  test('admits it cannot judge a cook with no trustworthy estimate', () => {
    renderCard({ plan: plan({ verdict: 'unknown', slackMinutes: null }) });

    expect(screen.getByTestId('serve-plan-headline')).toHaveTextContent('Gathering data');
    expect(screen.getByTestId('serve-plan-advice')).toHaveTextContent(
      'Waiting for a steady estimate'
    );
  });

  test('warns that a cook beyond the tolerance is off plan, either way', () => {
    const { unmount } = renderCard({ plan: plan({ verdict: 'behind', slackMinutes: -35 }) });
    expect(screen.getByTestId('serve-plan-off-plan')).toHaveTextContent(
      'Off plan — dinner will be 35m later than you planned'
    );
    unmount();

    renderCard({ plan: plan({ verdict: 'early', slackMinutes: 65 }) });
    expect(screen.getByTestId('serve-plan-off-plan')).toHaveTextContent(
      'Off plan — the meat is ready 1h 05m before you planned'
    );
  });

  test('leaves a cook inside the tolerance unwarned', () => {
    renderCard({ plan: plan({ verdict: 'ontrack', slackMinutes: 20 }) });

    expect(screen.queryByTestId('serve-plan-off-plan')).not.toBeInTheDocument();
  });

  test('moves the serving time a quarter of an hour a tap, either way', async () => {
    const onServeAtChange = jest.fn();
    renderCard({ onServeAtChange });

    await userEvent.click(screen.getByRole('button', { name: 'Serve later' }));
    expect(onServeAtChange).toHaveBeenCalledWith(new Date(2026, 7, 1, 18, 15));

    // Back down from where the first tap left it — the taps are of one plan
    // being moved, not two independent readings of the stored one.
    await userEvent.click(screen.getByRole('button', { name: 'Serve earlier' }));
    expect(onServeAtChange).toHaveBeenLastCalledWith(new Date(2026, 7, 1, 18, 0));
  });

  test('moves the rest a quarter of an hour a tap, either way', async () => {
    const onRestChange = jest.fn();
    renderCard({ onRestChange });

    await userEvent.click(screen.getByRole('button', { name: 'Rest longer' }));
    expect(onRestChange).toHaveBeenCalledWith(45);

    await userEvent.click(screen.getByRole('button', { name: 'Rest less' }));
    expect(onRestChange).toHaveBeenLastCalledWith(30);
  });

  test('never asks for a rest shorter than none or longer than six hours', async () => {
    const onRestChange = jest.fn();
    const { unmount } = renderCard({ plan: plan({ restMinutes: 0 }), onRestChange });
    await userEvent.click(screen.getByRole('button', { name: 'Rest less' }));
    expect(onRestChange).not.toHaveBeenCalled();
    unmount();

    renderCard({ plan: plan({ restMinutes: 360 }), onRestChange });
    await userEvent.click(screen.getByRole('button', { name: 'Rest longer' }));
    expect(onRestChange).not.toHaveBeenCalled();
  });

  test('shows the plan being stepped: the serving time and the rest as stored', () => {
    renderCard({ plan: plan({ restMinutes: 90 }) });

    expect(screen.getByTestId('serve-plan-serve-at')).toHaveTextContent('6:00 PM');
    expect(screen.getByTestId('serve-plan-rest')).toHaveTextContent('1h 30m');
  });

  test('adds up taps made inside one round trip rather than collapsing them', async () => {
    // Three taps in the time one write takes: the card is still holding the
    // plan the backend judged, so a stepper reading the prop each time would
    // ask for the same quarter-hour three times and move dinner fifteen
    // minutes instead of forty-five.
    const onServeAtChange = jest.fn((_serveAt: Date) => new Promise<boolean>(() => undefined));
    renderCard({ onServeAtChange });

    const later = screen.getByRole('button', { name: 'Serve later' });
    await userEvent.click(later);
    await userEvent.click(later);
    await userEvent.click(later);

    expect(onServeAtChange.mock.calls.map(call => call[0])).toEqual([
      new Date(2026, 7, 1, 18, 15),
      new Date(2026, 7, 1, 18, 30),
      new Date(2026, 7, 1, 18, 45),
    ]);
    expect(screen.getByTestId('serve-plan-serve-at')).toHaveTextContent('6:45 PM');
  });

  test('holds the rest inside its range across taps the backend has not answered', async () => {
    const onRestChange = jest.fn((_restMinutes: number) => new Promise<boolean>(() => undefined));
    renderCard({ plan: plan({ restMinutes: 330 }), onRestChange });

    const longer = screen.getByRole('button', { name: 'Rest longer' });
    await userEvent.click(longer);
    await userEvent.click(longer);
    await userEvent.click(longer);

    // The third tap is at the ceiling, and asks for nothing.
    expect(onRestChange.mock.calls.map(call => call[0])).toEqual([345, 360]);
    expect(screen.getByTestId('serve-plan-rest')).toHaveTextContent('6h 00m');
  });

  test('falls back to the stored plan when the tap could not be saved', async () => {
    const onServeAtChange = jest.fn((_serveAt: Date) => Promise.resolve(false));
    renderCard({ onServeAtChange });

    await userEvent.click(screen.getByRole('button', { name: 'Serve later' }));

    await waitFor(() =>
      expect(screen.getByTestId('serve-plan-serve-at')).toHaveTextContent('6:00 PM')
    );
  });

  test('shows the plan the backend judged once it answers, not the tap that asked', async () => {
    const onServeAtChange = jest.fn((_serveAt: Date) => new Promise<boolean>(() => undefined));
    const { rerender } = render(
      <DesignSurface>
        <ServePlanCard plan={plan()} onServeAtChange={onServeAtChange} onRestChange={jest.fn()} />
      </DesignSurface>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Serve later' }));

    // Another device moved dinner while this one was mid-tap: the plan the
    // backend judged wins over the guess on screen.
    rerender(
      <DesignSurface>
        <ServePlanCard
          plan={plan({ serveAt: new Date(2026, 7, 1, 19, 30) })}
          onServeAtChange={onServeAtChange}
          onRestChange={jest.fn()}
        />
      </DesignSurface>
    );

    await waitFor(() =>
      expect(screen.getByTestId('serve-plan-serve-at')).toHaveTextContent('7:30 PM')
    );
  });

  test('says it is gathering data before the cook has a plan at all', async () => {
    const onCreatePlan = jest.fn();
    renderCard({ plan: null, onCreatePlan });

    expect(screen.getByTestId('serve-plan-headline')).toHaveTextContent('Gathering data');
    expect(screen.getByTestId('serve-plan-advice')).toHaveTextContent(
      'Waiting for a steady estimate'
    );
    // Nothing to step yet — and no clock time invented for a plan that does
    // not exist.
    expect(screen.queryByTestId('serve-plan-serve-at')).not.toBeInTheDocument();
    expect(screen.queryByTestId('serve-plan-milestone')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Set serving time' }));
    expect(onCreatePlan).toHaveBeenCalled();
  });

  test('reads the plan as a schedule: the wrap still ahead, the pull, the rest', () => {
    renderCard({
      plan: plan({
        milestones: [
          { kind: 'wrap', at: null, temp: 165 },
          { kind: 'pullBy', at: new Date(2026, 7, 1, 17, 30), temp: null },
          { kind: 'restUntil', at: new Date(2026, 7, 1, 18, 0), temp: null },
        ],
      }),
    });

    expect(screen.getAllByTestId('serve-plan-milestone').map(row => row.textContent)).toEqual([
      'Wrap around 165°F',
      'Pull by 5:30 PM',
      'Rest until 6:00 PM',
    ]);
  });
});
