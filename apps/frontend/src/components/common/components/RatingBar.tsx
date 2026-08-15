import { Box } from '@mui/material';
import React, { useRef } from 'react';

/** The scale the bar scores against. */
const MAX = 10;
/** The smallest score the bar can hold, and the size of every step. */
const STEP = 0.5;

/**
 * Snap a raw score onto the bar's half-step scale: rounded to the nearest half
 * point and clamped between the half-point minimum and ten. This is the one
 * piece of arithmetic anyone would argue about, so it is exported on its own —
 * it can be argued about without rendering anything.
 */
export function clampHalfStep(raw: number): number {
  return Math.min(MAX, Math.max(STEP, Math.round(raw * 2) / 2));
}

/**
 * The score a horizontal position on the bar means. `fraction` is how far
 * along the bar the pointer sits, 0 at the left edge and 1 at the right; the
 * left edge reads as the minimum rather than zero because the bar cannot say
 * "no rating" — that is what never touching it says.
 */
export function ratingFromFraction(fraction: number): number {
  return clampHalfStep(fraction * MAX);
}

/** How one of the ten segments is drawn for a given score. */
export type SegmentFill = 'full' | 'half' | 'empty';

/**
 * The ten segments a score fills, left to right. A segment is full once the
 * score has passed it and half full when the score ends on its midpoint —
 * which, on a half-step scale, is the only other place a score can end.
 */
export function segmentFills(value: number): SegmentFill[] {
  return Array.from({ length: MAX }, (_unused, index) => {
    if (value >= index + 1) {
      return 'full';
    }
    return value > index ? 'half' : 'empty';
  });
}

export interface RatingBarProps {
  /** What is being scored, in ordinary words; also names the slider. */
  label: string;
  /** The current score, out of ten. Zero (or NaN) reads as not yet rated. */
  value: number;
  /** Called with the snapped half-step score whenever interaction changes it. */
  onChange: (value: number) => void;
  /** `data-testid` for the bar; the value label derives `<testId>-value`. */
  testId?: string;
}

/**
 * The design's rating input: a label, the score as "n / 10", and a bar of ten
 * segments filled to the score. A pointer drags or taps a score onto it; the
 * arrow keys move it by half a point.
 *
 * It is bespoke rather than a restyled Material-UI `Slider` or `Rating`
 * because the design's control is a different object from either — ten square
 * segments with a half-filled boundary cell and no thumb. It is a slider to
 * assistive technology, because that is what it is: one value on a bounded
 * scale, adjusted in steps.
 */
export function RatingBar({ label, value, onChange, testId }: RatingBarProps): JSX.Element {
  const rated = Number.isFinite(value) && value > 0;

  // Whether a pointer is currently pressed on the bar — a ref, not state,
  // because nothing about the drawing changes with it and re-rendering per
  // pointer event would fight the drag it is tracking.
  const dragging = useRef(false);

  /** Score the bar from where a pointer sits along it. */
  const scoreAt = (event: React.PointerEvent<HTMLElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }
    onChange(ratingFromFraction((event.clientX - rect.left) / rect.width));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLElement>): void => {
    dragging.current = true;
    // Keep the gesture even when the pointer wanders off the bar mid-drag.
    // jsdom (and older browsers) have no pointer capture; the drag still
    // works there, it just lets go at the element edge.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    scoreAt(event);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>): void => {
    if (dragging.current) {
      scoreAt(event);
    }
  };

  const endDrag = (): void => {
    dragging.current = false;
  };

  // The slider keyboard contract: arrows step by half a point, Home and End
  // jump to the ends. An unrated bar steps onto the bottom of the scale —
  // clampHalfStep carries 0 + 0.5 to the 0.5 minimum on its own.
  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    const current = rated ? value : 0;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = clampHalfStep(current + STEP);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = clampHalfStep(current - STEP);
        break;
      case 'Home':
        next = STEP;
        break;
      case 'End':
        next = MAX;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(next);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Box
          component="span"
          sx={theme => ({
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: theme.design.text,
          })}
        >
          {label}
        </Box>
        <Box
          component="span"
          data-testid={testId ? `${testId}-value` : undefined}
          aria-hidden="true"
          sx={theme => ({ fontSize: '0.8125rem', color: theme.design.textSecondary })}
        >
          <Box
            component="span"
            sx={theme => ({ fontWeight: 700, color: theme.design.text })}
          >{`${rated ? value : '—'}`}</Box>
          {' / 10'}
        </Box>
      </Box>
      <Box
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={STEP}
        aria-valuemax={MAX}
        aria-valuenow={rated ? value : STEP}
        aria-valuetext={rated ? `${value} out of 10` : 'not rated'}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        data-testid={testId}
        sx={{ display: 'flex', gap: '3px', touchAction: 'none', cursor: 'pointer' }}
      >
        {segmentFills(rated ? value : 0).map((fill, index) => (
          <Box
            key={index}
            data-testid="rating-bar-segment"
            data-fill={fill}
            sx={theme => ({
              flex: 1,
              height: 14,
              borderRadius: '3px',
              overflow: 'hidden',
              backgroundColor: theme.design.surfaceAlt,
            })}
          >
            <Box
              sx={theme => ({
                width: fill === 'full' ? '100%' : fill === 'half' ? '50%' : 0,
                height: '100%',
                backgroundColor: theme.design.accent,
              })}
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
