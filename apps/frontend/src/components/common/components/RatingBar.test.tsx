/**
 * The design's half-step rating bar: ten segments filled to the score, dragged
 * or tapped with a pointer, nudged by half a point with the arrow keys.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { DesignSurface, appTheme } from '../../../theme';
import { RatingBar } from './RatingBar';

type BarProps = React.ComponentProps<typeof RatingBar>;

const renderBar = (props: Partial<BarProps> = {}): ReturnType<typeof render> =>
  render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <RatingBar
          label="Smoke Flavor"
          value={7.5}
          onChange={jest.fn()}
          testId="rating-bar-smoke-flavor"
          {...props}
        />
      </DesignSurface>
    </CssVarsProvider>
  );

describe('adjusting the score from the keyboard', () => {
  it.each([
    ['ArrowRight', 7.5, 8],
    ['ArrowUp', 7.5, 8],
    ['ArrowLeft', 7.5, 7],
    ['ArrowDown', 7.5, 7],
    ['Home', 7.5, 0.5],
    ['End', 7.5, 10],
  ])('%s moves a score of %d to %d', (key, value, expected) => {
    const onChange = jest.fn();
    renderBar({ value, onChange });

    fireEvent.keyDown(screen.getByRole('slider'), { key });

    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it('clamps at the ends of the scale instead of stepping past them', () => {
    const onChange = jest.fn();
    const { unmount } = renderBar({ value: 10, onChange });
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith(10);
    unmount();

    renderBar({ value: 0.5, onChange });
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith(0.5);
  });

  it('steps an unrated bar onto the bottom of the scale', () => {
    const onChange = jest.fn();
    renderBar({ value: 0, onChange });

    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledWith(0.5);
  });

  it('leaves other keys alone', () => {
    const onChange = jest.fn();
    renderBar({ onChange });

    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Tab' });

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('scoring the bar with a pointer', () => {
  /**
   * jsdom has no PointerEvent constructor, and the fallback event
   * testing-library builds drops `clientX` — so pointer events are fired as
   * MouseEvents, which carry coordinates and dispatch to the same handlers.
   */
  const firePointer = (target: HTMLElement, type: string, clientX: number): void => {
    fireEvent(target, new MouseEvent(type, { bubbles: true, clientX }));
  };

  /** Pin the bar at a known place and size: 200px wide, starting at x = 0. */
  const pinBarRect = (slider: HTMLElement): void => {
    jest.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 14,
      width: 200,
      height: 14,
      toJSON: () => ({}),
    } as DOMRect);
  };

  it.each([
    // 149/200 of the way along a ten-point scale is 7.45, snapped to 7.5.
    [149, 7.5],
    [100, 5],
    // The left edge means the minimum, not zero: the bar cannot say "unrated".
    [0, 0.5],
    [200, 10],
    // Overshoot (pointer past either end mid-gesture) clamps to the scale.
    [250, 10],
    [-40, 0.5],
  ])('a tap at %dpx of 200 scores %d', (clientX, expected) => {
    const onChange = jest.fn();
    renderBar({ onChange });
    const slider = screen.getByRole('slider');
    pinBarRect(slider);

    firePointer(slider, 'pointerdown', clientX);

    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it('drags through half-step scores while the pointer is down', () => {
    const onChange = jest.fn();
    renderBar({ onChange });
    const slider = screen.getByRole('slider');
    pinBarRect(slider);

    firePointer(slider, 'pointerdown', 60);
    firePointer(slider, 'pointermove', 100);
    firePointer(slider, 'pointermove', 171);
    firePointer(slider, 'pointerup', 171);

    expect(onChange.mock.calls.map(call => call[0])).toEqual([3, 5, 8.5]);
  });

  it('ignores a pointer that moves across it without being pressed', () => {
    const onChange = jest.fn();
    renderBar({ onChange });
    const slider = screen.getByRole('slider');
    pinBarRect(slider);

    firePointer(slider, 'pointermove', 100);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops scoring once the pointer is released', () => {
    const onChange = jest.fn();
    renderBar({ onChange });
    const slider = screen.getByRole('slider');
    pinBarRect(slider);

    firePointer(slider, 'pointerdown', 60);
    firePointer(slider, 'pointerup', 60);
    firePointer(slider, 'pointermove', 180);

    expect(onChange.mock.calls.map(call => call[0])).toEqual([3]);
  });
});

describe('a half-step rating bar', () => {
  it('is a slider named by its label, scored out of ten in half steps', () => {
    renderBar();

    const slider = screen.getByRole('slider', { name: 'Smoke Flavor' });
    expect(slider).toHaveAttribute('aria-valuemin', '0.5');
    expect(slider).toHaveAttribute('aria-valuemax', '10');
    expect(slider).toHaveAttribute('aria-valuenow', '7.5');
    expect(slider).toHaveAttribute('aria-valuetext', '7.5 out of 10');
  });

  it('shows the label and the current score out of ten', () => {
    renderBar();

    expect(screen.getByText('Smoke Flavor')).toBeVisible();
    expect(screen.getByTestId('rating-bar-smoke-flavor-value')).toHaveTextContent('7.5 / 10');
  });

  it('draws ten segments, filled to the score with a half-filled boundary', () => {
    renderBar();

    const segments = screen.getAllByTestId('rating-bar-segment');
    expect(segments).toHaveLength(10);
    // 7.5: seven full, the eighth half full, the rest empty.
    expect(segments.slice(0, 7).map(s => s.getAttribute('data-fill'))).toEqual(
      Array(7).fill('full')
    );
    expect(segments[7]).toHaveAttribute('data-fill', 'half');
    expect(segments.slice(8).map(s => s.getAttribute('data-fill'))).toEqual(['empty', 'empty']);
  });
});
