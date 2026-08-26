import { Box, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import React, { useState } from 'react';
import { CookEvent } from '../../../api/types';
import { toneColor } from '../../common/stampTones';
import { DetailSection } from '../../common/components/DetailSection';

export interface CookLogSectionProps {
  /** The cook's log, in whatever order it was handed over. */
  events: CookEvent[];
  /** Removes one entry from the record, resolving whether it was removed. */
  onRemove: (id: string) => Promise<boolean>;
}

/** A temperature as the log states it, or a dash when the pit said nothing. */
const asDegrees = (reading: number | null): string =>
  reading === null ? '—' : `${Math.round(reading)}°`;

/** The moment as a clock time in the reader's own zone. */
const asClock = (at: Date): string =>
  at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * The cook log of a past smoke, as a section of the history detail.
 *
 * Oldest first, unlike the live card: the live screen is read for what just
 * happened, and a finished cook is read as a story from the beginning — the
 * same order the markers run in along the chart above.
 *
 * A cook nobody stamped anything on gets no section at all rather than an empty
 * one: the record of a cook run before this feature existed should read as the
 * record it always was, not as a cook whose log was lost.
 */
export function CookLogSection({ events, onRemove }: CookLogSectionProps): JSX.Element | null {
  /**
   * The entry whose removal is still in the air, so its cross can go quiet
   * until it lands. A thumb on a phone double-taps, and the second removal of
   * an entry the first one already took away comes back as a failure about a
   * removal that succeeded.
   */
  const [removing, setRemoving] = useState<string | null>(null);

  const remove = async (id: string): Promise<void> => {
    setRemoving(id);
    try {
      await onRemove(id);
    } finally {
      // Cleared either way: the entry that stayed is the reader's to try again.
      setRemoving(current => (current === id ? null : current));
    }
  };

  if (events.length === 0) return null;

  // Oldest first, without disturbing the list the caller holds.
  const oldestFirst = [...events].sort((one, other) => one.at.getTime() - other.at.getTime());

  return (
    <DetailSection number="4" title="Cook Log" testId="review-cook-log-section">
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        {oldestFirst.map((entry, index) => (
          <Box
            key={entry._id}
            data-testid="cook-log-entry"
            sx={theme => ({
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 2px',
              // Between the entries only: a rule above the first would double
              // the section heading's own separation from it.
              borderTop: index === 0 ? 'none' : `1px solid ${theme.design.border}`,
            })}
          >
            {/* Colour alone says nothing to anybody who cannot see it, so the
                dot only reinforces the label beside it — and it is the colour
                the chart drew this event's marker in. */}
            <Box
              aria-hidden="true"
              data-testid={`cook-log-tone-${entry._id}`}
              sx={theme => ({
                width: 8,
                height: 8,
                borderRadius: '50%',
                flexShrink: 0,
                backgroundColor: toneColor(entry.tone, theme.design),
              })}
            />
            <Typography variant="body2" sx={{ fontWeight: 600, flexGrow: 1 }}>
              {entry.label}
            </Typography>
            <Typography variant="body2" sx={theme => ({ color: theme.design.textSecondary })}>
              {asDegrees(entry.chamberTemp)}
            </Typography>
            <Typography variant="body2" sx={theme => ({ color: theme.design.textSecondary })}>
              {asClock(entry.at)}
            </Typography>
            <IconButton
              size="small"
              aria-label={`Remove ${entry.label}`}
              disabled={removing === entry._id}
              onClick={() => void remove(entry._id)}
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          </Box>
        ))}
      </Box>
    </DetailSection>
  );
}
