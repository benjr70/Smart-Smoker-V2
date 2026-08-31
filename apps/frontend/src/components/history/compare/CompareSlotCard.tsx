/**
 * One of the two slots at the top of the comparison: which cook is in it, and
 * which colour that cook is.
 *
 * It stays on screen while the sections below scroll past, because every colour
 * further down the page only means anything against the name up here.
 */
import { Box } from '@mui/material';
import React from 'react';
import { CompareCook } from '../../../api';
import { formatDateLabel } from '../../common/timeFormat';

export interface CompareSlotCardProps {
  /** Which slot this is — the letter the rest of the screen refers to it by. */
  side: 'A' | 'B';
  /** The cook in the slot, or `null` while nothing has been chosen for it. */
  cook: CompareCook | null;
  /** The colour that means this cook, everywhere on the screen. */
  color: string;
}

export function CompareSlotCard({ side, cook, color }: CompareSlotCardProps): JSX.Element {
  return (
    <Box
      data-testid={`compare-slot-${side.toLowerCase()}`}
      sx={theme => ({
        flex: 1,
        minWidth: 0,
        minHeight: 66,
        padding: '10px 12px',
        borderRadius: '13px',
        backgroundColor: theme.design.surface,
        border: `1.5px solid ${theme.design.border}`,
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
        <Box
          component="span"
          aria-hidden="true"
          data-testid="compare-slot-dot"
          sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: color }}
        />
        <Box
          component="span"
          sx={theme => ({
            fontSize: '0.625rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            color: theme.design.textSecondary,
          })}
        >
          COOK {side}
        </Box>
      </Box>
      <Box
        data-testid="compare-slot-name"
        sx={theme => ({
          fontSize: '0.875rem',
          fontWeight: 700,
          color: theme.design.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        })}
      >
        {cook?.name || 'Choose…'}
      </Box>
      <Box
        sx={theme => ({
          fontSize: '0.6875rem',
          marginTop: '1px',
          color: theme.design.textSecondary,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        })}
      >
        {cook ? `${formatDateLabel(cook.date)} · ${cook.preSmoke.meatType || '—'}` : 'Nothing yet'}
      </Box>
    </Box>
  );
}
