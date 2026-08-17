import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CompletionEstimate } from '../../../api';
import { DesignSurface, carbonLight, resolveDesignPalette } from '../../../theme';
import { CompletionCard } from './CompletionCard';

/** The palette the card is painted in under test, which is the light one. */
const design = resolveDesignPalette(carbonLight, 'light');

/** The design's colours as the browser reports them. */
const rgb = (hex: string): string => {
  const [r, g, b] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

/**
 * The card is rendered the way the application renders it — inside the design
 * surface, in real Material-UI — so what it says and what colour it says it in
 * are both read off the document rather than taken on trust from props.
 */
const renderCard = (props: Partial<React.ComponentProps<typeof CompletionCard>> = {}) =>
  render(
    <DesignSurface>
      <CompletionCard
        estimate={null}
        probe={{ slot: 'probe1', name: 'Brisket' }}
        onTargetChange={jest.fn()}
        {...props}
      />
    </DesignSurface>
  );

/** An estimate of a cook that is going to plan, with everything filled in. */
const onTrack = (over: Partial<CompletionEstimate> = {}): CompletionEstimate => ({
  state: 'ok',
  // Built from local parts rather than from a UTC string, because the headline
  // is a clock time in the reader's own zone.
  eta: new Date(2026, 7, 1, 18, 30),
  hoursRemaining: 2.0833,
  ratePerHour: 8.2,
  progressPercent: 62,
  startTemp: 45,
  targetTemp: 203,
  ...over,
});

describe('the estimated completion card', () => {
  test('says when the cook will be done, and how long that is away', () => {
    renderCard({ estimate: onTrack() });

    expect(screen.getByText('ESTIMATED COMPLETION')).toBeInTheDocument();
    // The clock time itself, in whichever way this reader's locale writes half
    // past six in the evening.
    expect(screen.getByTestId('completion-headline').textContent).toMatch(/(6:30|18:30)/);
    expect(screen.getByTestId('completion-detail')).toHaveTextContent('~2h 05m remaining');
  });

  test('says the meat is ready, in the positive colour, and which probe got there', () => {
    renderCard({
      estimate: onTrack({ state: 'done', eta: null, hoursRemaining: 0, progressPercent: 100 }),
    });

    const headline = screen.getByTestId('completion-headline');
    expect(headline).toHaveTextContent('Ready now');
    // Done is the one state the card celebrates, so it is said in the design's
    // positive green rather than in the ordinary ink of a number.
    expect(getComputedStyle(headline).color).toBe(rgb(design.success));
    expect(screen.getByTestId('completion-detail')).toHaveTextContent('Brisket reached 203°F');
  });

  /**
   * The three states with no number to show. Each says what is happening in
   * words, because a card that only ever went blank would be indistinguishable
   * from one that had broken — and "Holding" in particular is the message that
   * keeps a pitmaster from cranking the heat through the stall.
   */
  test.each([
    ['stalled', 'Holding', 'Temp plateaued — the stall is normal'],
    ['paused', 'Paused', 'Resume smoking to estimate'],
    ['warming', 'Calculating', 'Gathering temperature data'],
  ] as const)('a %s cook reads "%s"', (state, headline, detail) => {
    renderCard({
      estimate: onTrack({ state, eta: null, hoursRemaining: null }),
    });

    expect(screen.getByTestId('completion-headline')).toHaveTextContent(headline);
    expect(screen.getByTestId('completion-detail')).toHaveTextContent(detail);
    // Only "done" is celebrated; nothing else is dressed up as good news.
    expect(getComputedStyle(screen.getByTestId('completion-headline')).color).not.toBe(
      rgb(design.success)
    );
  });
});

/**
 * The bar under the numbers: how far the meat has come from where the cook
 * started it, and how fast it is still climbing. It is the part of the card that
 * still says something when the ETA cannot.
 */
describe('the progress bar', () => {
  /** The filled part of the bar, which is what carries its colour and length. */
  const fill = (): HTMLElement => screen.getByTestId('completion-progress-fill');

  test('fills to the progress the server measured, in the watched probe’s colour', () => {
    renderCard({ estimate: onTrack() });

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '62');
    expect(getComputedStyle(fill()).width).toBe('62%');
    expect(getComputedStyle(fill()).backgroundColor).toBe(rgb(design.probes.probe1));
  });

  test('shows the climb rate, and the target it is climbing to', () => {
    renderCard({ estimate: onTrack() });

    expect(screen.getByTestId('completion-rate')).toHaveTextContent('+8.2°/hr');
    expect(screen.getByTestId('completion-target-caption')).toHaveTextContent('Target 203°F');
  });

  test('says nothing it does not know about the rate', () => {
    renderCard({ estimate: onTrack({ ratePerHour: null }) });

    expect(screen.getByTestId('completion-rate')).toHaveTextContent('—');
  });

  test('a meat that is cooling says so rather than claiming it is climbing', () => {
    renderCard({ estimate: onTrack({ ratePerHour: -1.4 }) });

    expect(screen.getByTestId('completion-rate')).toHaveTextContent('−1.4°/hr');
  });

  test('a finished cook fills the bar, in the positive colour', () => {
    renderCard({ estimate: onTrack({ state: 'done', progressPercent: 100, eta: null }) });

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(getComputedStyle(fill()).width).toBe('100%');
    expect(getComputedStyle(fill()).backgroundColor).toBe(rgb(design.success));
  });
});

/**
 * The target the estimate is taken to, edited where the cook is watched from
 * rather than on the settings screen — the whole point of the row.
 */
describe('the target editor', () => {
  const targetInput = (): HTMLInputElement =>
    screen.getByTestId('completion-target-input') as HTMLInputElement;

  test('shows the target the cook is being taken to', () => {
    renderCard({ estimate: onTrack() });

    expect(targetInput().value).toBe('203');
  });

  test('nudging the target commits the new temperature', async () => {
    const onTargetChange = jest.fn();
    renderCard({ estimate: onTrack(), onTargetChange });

    await userEvent.click(screen.getByTestId('completion-target-up'));
    expect(onTargetChange).toHaveBeenLastCalledWith(208);

    // The second press moves the number the row is now showing, not the one the
    // server last confirmed: two presses of the same stepper walk, they do not
    // send the same temperature twice.
    await userEvent.click(screen.getByTestId('completion-target-down'));
    expect(onTargetChange).toHaveBeenLastCalledWith(203);
  });

  /**
   * A temperature typed a digit at a time is not a temperature until the field
   * is left: committing per keystroke would clamp "2" to 100 and rewrite the
   * field under the fingers typing 225 into it.
   */
  test('a typed temperature is committed when the field is left, not per keystroke', async () => {
    const onTargetChange = jest.fn();
    renderCard({ estimate: onTrack(), onTargetChange });

    await userEvent.clear(targetInput());
    await userEvent.type(targetInput(), '195');
    expect(onTargetChange).not.toHaveBeenCalled();

    await userEvent.tab();

    expect(onTargetChange).toHaveBeenCalledWith(195);
  });

  test.each([
    ['400', 300],
    ['50', 100],
  ])('a target typed as %s is clamped to the smoker’s range', async (typed, clamped) => {
    const onTargetChange = jest.fn();
    renderCard({ estimate: onTrack(), onTargetChange });

    await userEvent.clear(targetInput());
    await userEvent.type(targetInput(), typed);
    await userEvent.tab();

    expect(onTargetChange).toHaveBeenCalledWith(clamped);
    // The field shows what was actually saved, not the number that was refused.
    expect(targetInput().value).toBe(String(clamped));
  });

  test('the steppers cannot walk the target out of range either', async () => {
    const onTargetChange = jest.fn();
    renderCard({ estimate: onTrack({ targetTemp: 300 }), onTargetChange });

    await userEvent.click(screen.getByTestId('completion-target-up'));

    expect(onTargetChange).not.toHaveBeenCalled();
    expect(targetInput().value).toBe('300');
  });

  test('pressing Enter commits the typed target, as leaving the field does', async () => {
    const onTargetChange = jest.fn();
    renderCard({ estimate: onTrack(), onTargetChange });

    await userEvent.clear(targetInput());
    await userEvent.type(targetInput(), '190{Enter}');

    expect(onTargetChange).toHaveBeenCalledWith(190);
  });

  test('a field left empty keeps the target it had', async () => {
    const onTargetChange = jest.fn();
    renderCard({ estimate: onTrack(), onTargetChange });

    await userEvent.clear(targetInput());
    await userEvent.tab();

    expect(onTargetChange).not.toHaveBeenCalled();
    expect(targetInput().value).toBe('203');
  });
});

/**
 * The estimate is taken to a probe's target, so an installation watching no
 * probe has nothing to estimate. The card stays on screen and says how to turn
 * the feature on, rather than disappearing and taking the explanation with it.
 */
describe('the card with no probe being watched', () => {
  /** What the backend answers when nothing is being watched: a state of `null`. */
  const nothingWatched: CompletionEstimate = {
    state: null,
    eta: null,
    hoursRemaining: null,
    ratePerHour: null,
    progressPercent: null,
    startTemp: null,
    targetTemp: null,
  };

  test('says how to turn the estimate on, and offers the way to the settings', async () => {
    const onOpenSettings = jest.fn();
    renderCard({ estimate: nothingWatched, probe: null, onOpenSettings });

    expect(screen.getByTestId('completion-headline')).toHaveTextContent('—');
    const prompt = screen.getByTestId('completion-settings-link');
    expect(prompt).toHaveTextContent('Watch a probe in Settings to get an estimate');

    await userEvent.click(prompt);

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  test('says nothing about probes before the first read has answered', () => {
    // Nothing has been read yet, so nothing is known — including whether a probe
    // is being watched. Telling a cook who *is* watching one to go and watch one
    // would be wrong for the beat before the answer arrives.
    renderCard({ estimate: null });

    expect(screen.getByTestId('completion-headline')).toHaveTextContent('—');
    expect(screen.queryByTestId('completion-settings-link')).not.toBeInTheDocument();
  });

  test('offers no target to edit, because there is no probe to edit it for', () => {
    renderCard({ estimate: nothingWatched, probe: null });

    expect(screen.queryByTestId('completion-target-input')).not.toBeInTheDocument();
  });
});
