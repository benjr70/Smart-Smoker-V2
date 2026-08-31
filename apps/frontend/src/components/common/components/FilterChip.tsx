import { Box } from '@mui/material';
import React from 'react';

export interface FilterChipProps {
  /** What the chip narrows to, in the user's words. */
  label: string;
  /** Whether the chip is currently in effect. */
  active: boolean;
  /** Called when the chip is pressed, to apply or drop it. */
  onClick: () => void;
  /**
   * How tall the chip is, at the least. The history list runs its chips at the
   * design's 36px inside a header that is already crowded; the compare picker
   * runs them at the 44px thumb target, because the picker is a sheet driven
   * one-handed with nothing else competing for the room.
   */
  minHeight?: number;
  /** Addresses the chip in tests and journeys. */
  testId?: string;
}

/**
 * One filter chip: a pill that is either in effect or not.
 *
 * A toggle, so it says so (`aria-pressed`) — the design tells the two states
 * apart by colour alone, which is nothing at all to a screen reader.
 *
 * Shared between the history list's header and the compare cook picker so the
 * two rows of pills cannot drift apart: they are the same control narrowing the
 * same archive, seen from two screens.
 */
export function FilterChip({
  label,
  active,
  onClick,
  minHeight = 36,
  testId,
}: FilterChipProps): JSX.Element {
  return (
    <Box
      component="button"
      type="button"
      aria-pressed={active}
      data-testid={testId}
      onClick={onClick}
      sx={theme => ({
        flexShrink: 0,
        minHeight,
        padding: '0 14px',
        borderRadius: '22px',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: '0.8125rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        backgroundColor: active ? theme.design.accent : theme.design.surfaceAlt,
        color: active
          ? theme.palette.getContrastText(theme.design.accent)
          : theme.design.textSecondary,
        border: `1.5px solid ${active ? theme.design.accent : theme.design.border}`,
        transition: 'background-color 150ms ease, color 150ms ease',
      })}
    >
      {label}
    </Box>
  );
}
