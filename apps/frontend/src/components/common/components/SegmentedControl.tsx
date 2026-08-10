import { Box } from '@mui/material';
import React from 'react';

/** One segment: the value it selects and what it reads. */
export interface SegmentedControlOption<Value extends string> {
  value: Value;
  label: string;
}

export interface SegmentedControlProps<Value extends string> {
  /** The segments, left to right. */
  options: readonly SegmentedControlOption<Value>[];
  /** The value currently in effect; the segment carrying it is the selected one. */
  value: Value;
  /** Called with a segment's value when that segment is chosen. */
  onChange: (value: Value) => void;
  /** Names the control for assistive technology. */
  label: string;
  /**
   * Prefix for each segment's `data-testid`, completed with the segment's own
   * value (`<prefix>-<value>`). Optional: a control nobody addresses by name
   * needs none.
   */
  testIdPrefix?: string;
}

/**
 * The design's segmented control: one track, a segment per choice, the chosen
 * one raised out of the track.
 *
 * It is bespoke rather than a restyled Material-UI `Tabs`/`ToggleButtonGroup`
 * because the design's segment is a different object from either — a pill
 * lifted onto its own surface inside a recessed track, with no indicator bar
 * and no outline between neighbours. Dressing a library component up as that
 * costs more overrides than the fifty lines below, and every one of those
 * overrides is a bet on the library's internal class names.
 *
 * It is a tab list, because that is what the thing is: a row of choices where
 * exactly one is in effect and choosing another swaps what is shown beneath.
 * That brings the tab list's keyboard contract with it — the arrows move
 * between segments, Home and End jump to the ends, and only the selected
 * segment is in the tab order, so a keyboard reaches the row once rather than
 * once per segment.
 *
 * The control is fully controlled: it holds no selection of its own, so the
 * screen above it stays the single place the current step is decided.
 */
export function SegmentedControl<Value extends string>({
  options,
  value,
  onChange,
  label,
  testIdPrefix,
}: SegmentedControlProps<Value>): JSX.Element {
  const selectedIndex = options.findIndex(option => option.value === value);

  const moveTo = (index: number, container: HTMLElement | null): void => {
    const option = options[(index + options.length) % options.length];
    if (!option) {
      return;
    }
    onChange(option.value);
    // The moved-to segment takes the focus with it: a roving tab order that
    // left the focus behind would strand it on an element about to leave the
    // tab order.
    container
      ?.querySelectorAll<HTMLElement>('[role="tab"]')
      [(index + options.length) % options.length]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    const container = event.currentTarget;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        moveTo(selectedIndex + 1, container);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        moveTo(selectedIndex - 1, container);
        break;
      case 'Home':
        event.preventDefault();
        moveTo(0, container);
        break;
      case 'End':
        event.preventDefault();
        moveTo(options.length - 1, container);
        break;
      default:
        break;
    }
  };

  return (
    <Box
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      sx={theme => ({
        display: 'flex',
        gap: 0.5,
        padding: '4px',
        borderRadius: '10px',
        // The track is the recessed surface the segments sit in, so it is the
        // alternate surface rather than the card one: a segment raised onto the
        // card colour has to be lighter than what it came out of.
        backgroundColor: theme.design.surfaceAlt,
      })}
    >
      {options.map(option => {
        const selected = option.value === value;

        return (
          <Box
            component="button"
            type="button"
            key={option.value}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            data-testid={testIdPrefix ? `${testIdPrefix}-${option.value}` : undefined}
            onClick={() => onChange(option.value)}
            sx={theme => ({
              flex: 1,
              minWidth: 0,
              border: 'none',
              cursor: 'pointer',
              padding: '8px 4px',
              borderRadius: '8px',
              font: 'inherit',
              fontSize: '0.875rem',
              fontWeight: selected ? 700 : 500,
              // The selected segment is lifted out of the track: the card
              // surface, the accent, and a shadow to carry the lift. The rest
              // stay in the track — no surface of their own, supporting ink.
              backgroundColor: selected ? theme.design.surface : 'transparent',
              color: selected ? theme.design.accent : theme.design.textSecondary,
              boxShadow: selected ? '0 1px 3px rgba(0, 0, 0, 0.18)' : 'none',
              transition: 'background-color 120ms ease, color 120ms ease',
            })}
          >
            {option.label}
          </Box>
        );
      })}
    </Box>
  );
}
