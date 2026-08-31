/**
 * The way into the comparison.
 *
 * There are two of them — the history list's header offers it over the whole
 * archive, and a cook being read offers it about that cook — and they are the
 * same pill: 44px so it is drivable with one thumb, in the surface the rest of
 * the screen's controls sit on. Written once, because a restyle of one entry
 * into compare that quietly left the other behind would be two different
 * doorways into the same screen.
 */
import { Box } from '@mui/material';
import React from 'react';

export interface CompareEntryButtonProps {
  /** What the pill says — what comparing means from where it is offered. */
  label: string;
  /**
   * Whether it spans the width it is given. The header's runs the width of the
   * header under the filters; the detail view's sits inline beside the back
   * arrow and is only as wide as its words.
   */
  fullWidth?: boolean;
  onClick: () => void;
}

export function CompareEntryButton({
  label,
  fullWidth = false,
  onClick,
}: CompareEntryButtonProps): JSX.Element {
  return (
    <Box
      component="button"
      type="button"
      data-testid="compare-entry"
      onClick={onClick}
      sx={theme => ({
        height: 44,
        width: fullWidth ? '100%' : 'auto',
        padding: fullWidth ? 0 : '0 16px',
        borderRadius: '11px',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: '0.8125rem',
        fontWeight: 600,
        color: theme.design.text,
        backgroundColor: theme.design.surface,
        border: `1.5px solid ${theme.design.border}`,
      })}
    >
      {label}
    </Box>
  );
}
