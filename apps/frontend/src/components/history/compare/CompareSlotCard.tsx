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
  /**
   * Whether the cook for this slot is still being read. An empty slot and one
   * whose cook is on its way look the same otherwise, and they are not the same
   * thing to say: one asks the user to choose, the other asks them to wait.
   */
  loading?: boolean;
  /**
   * Opens the cook picker for this slot. The card is the way to change the cook
   * in it — there is nowhere else on the screen to do it — so the whole card is
   * the control rather than an affordance tucked inside it.
   */
  onPick: () => void;
}

export function CompareSlotCard({
  side,
  cook,
  color,
  loading = false,
  onPick,
}: CompareSlotCardProps): JSX.Element {
  // Which cook is in the slot, in words. The slot cards are the only place the
  // comparison names its two cooks — every section below identifies them by
  // colour alone — so a control named only after what pressing it does would
  // leave a screen-reader user with a comparison of two anonymous cooks.
  const held = cook
    ? `${cook.name || 'Unnamed cook'}, ${formatDateLabel(cook.date)}, ${
        cook.preSmoke.meatType || 'no meat recorded'
      }`
    : loading
      ? 'still being read'
      : 'no cook chosen yet';

  return (
    <Box
      component="button"
      type="button"
      aria-label={`Cook ${side}: ${held}. Change cook ${side}`}
      onClick={onPick}
      data-testid={`compare-slot-${side.toLowerCase()}`}
      sx={theme => ({
        flex: 1,
        minWidth: 0,
        minHeight: 66,
        padding: '10px 12px',
        borderRadius: '13px',
        textAlign: 'left',
        font: 'inherit',
        cursor: 'pointer',
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
        {cook?.name || (loading ? 'Loading…' : 'Choose…')}
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
        {cook
          ? `${formatDateLabel(cook.date)} · ${cook.preSmoke.meatType || '—'}`
          : loading
            ? 'Reading this cook'
            : 'Nothing yet'}
      </Box>
    </Box>
  );
}
