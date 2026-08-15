import { Box, Card, IconButton, Typography } from '@mui/material';
import React from 'react';
import { SmokeHistory } from '../../../api/types';
import { TrashIcon } from '../../common/components/DesignIcons';
import { StarRating } from '../../common/components/StarRating';
import { formatCookDuration } from '../../common/timeFormat';

export interface SmokeCardProps {
  /** The cook this card is about. */
  smoke: SmokeHistory;
  /** Called with the smoke's id when the card is opened. */
  onViewClick: (smokeId: string) => void;
  /** Called with the smoke's id when the card's trash control is used. */
  onDeleteClick: (smokeId: string) => void;
}

/**
 * One past cook in the history list: its name, what was cooked on what, when it
 * happened, how it scored and how long it ran — and a trash control.
 */
export function SmokeCard({ smoke, onViewClick, onDeleteClick }: SmokeCardProps): JSX.Element {
  return (
    <Card data-testid="smoke-card" sx={{ padding: '16px', position: 'relative' }}>
      {/* The design makes the whole card the way into the cook. That is one
          control, so it is one button: an invisible one covering the card,
          named after what it opens. The alternative — a click handler on the
          card itself — is unreachable by keyboard and nameless to a screen
          reader, and wrapping the card's content in a button would swallow the
          trash control inside it. */}
      <Box
        component="button"
        type="button"
        data-testid="smoke-card-view-button"
        aria-label={`View ${smoke.name}`}
        onClick={() => onViewClick(smoke.smokeId)}
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          border: 'none',
          padding: 0,
          borderRadius: 'inherit',
          background: 'transparent',
          cursor: 'pointer',
        }}
      />
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 1.5,
          marginBottom: '8px',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h2"
            data-testid="smoke-card-name"
            sx={theme => ({ fontSize: '1rem', fontWeight: 700, color: theme.design.text })}
          >
            {smoke.name}
          </Typography>
          <Typography
            component="p"
            data-testid="smoke-card-details"
            sx={theme => ({
              fontSize: '0.8125rem',
              marginTop: '2px',
              color: theme.design.textSecondary,
            })}
          >
            {smoke.weight} {smoke.weightUnit} {smoke.meatType} · {smoke.woodType} wood
          </Typography>
        </Box>
        <Typography
          component="p"
          data-testid="smoke-card-date"
          sx={theme => ({
            fontSize: '0.75rem',
            whiteSpace: 'nowrap',
            marginTop: '2px',
            color: theme.design.textSecondary,
          })}
        >
          {smoke.date}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <StarRating value={parseFloat(smoke.overAllRating)} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box
            component="span"
            data-testid="smoke-card-duration"
            sx={theme => ({
              fontSize: '0.6875rem',
              fontWeight: 500,
              padding: '3px 8px',
              borderRadius: '6px',
              whiteSpace: 'nowrap',
              backgroundColor: theme.design.surfaceAlt,
              color: theme.design.textSecondary,
            })}
          >
            {formatCookDuration(smoke.durationMs)}
          </Box>
          {/* Lifted above the card-wide button so the trash is the control
              under the finger, not the one behind it. */}
          <IconButton
            data-testid="smoke-card-delete-button"
            aria-label={`Delete ${smoke.name}`}
            onClick={() => onDeleteClick(smoke.smokeId)}
            sx={theme => ({
              position: 'relative',
              zIndex: 1,
              width: 44,
              height: 44,
              marginRight: '-10px',
              borderRadius: '11px',
              color: theme.design.textSecondary,
            })}
          >
            <TrashIcon size={17} />
          </IconButton>
        </Box>
      </Box>
    </Card>
  );
}
