import React, { useEffect, useRef, useState } from 'react';
import { Box, Card, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { CookEvent, CookStamp, DEFAULT_STAMPS } from '../../../api';
import { toneColor } from '../../common/stampTones';

/**
 * How long a tapped button says what happened to it before going back to being
 * a button. Long enough to be read by somebody looking up from a smoker, short
 * enough that the next tap is never blocked by the last one's news.
 */
export const FLASH_MS = 900;

export interface EventLogProps {
  /** The stamps offered, in catalogue order. */
  stamps?: readonly CookStamp[];
  /** The log so far, oldest first — as the API serves it. */
  events: CookEvent[];
  /** Whether a cook is running; stray taps are worse than a missed one. */
  smoking: boolean;
  /** Logs one tap, resolving whether the backend stored it. */
  onRecord: (stampKey: string) => Promise<boolean>;
  /** Removes one mis-tapped entry. */
  onRemove: (id: string) => Promise<boolean>;
}

/** What a tapped button is saying right now. */
type Flash = { key: string; logged: boolean } | null;

/** A temperature as the log states it, or a dash when the pit said nothing. */
const asDegrees = (reading: number | null): string =>
  reading === null ? '—' : `${Math.round(reading)}°`;

/** The moment as a clock time in the reader's own zone. */
const asClock = (at: Date): string =>
  at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * The cook log: the stamps a pitmaster taps, and everything tapped so far.
 *
 * Buttons first and big, because they are used with a glove on beside a hot
 * smoker; the list under them so the cook reads back as a story. Newest first —
 * what just happened is what somebody looking at this screen is looking for,
 * even though the API serves the log in the order it happened.
 *
 * The card holds no log of its own and posts nothing: it is handed the events
 * and the two commands, so what it draws is always what the backend last said,
 * on this screen and on every other one at the same time.
 */
export function EventLog({
  stamps = DEFAULT_STAMPS,
  events,
  smoking,
  onRecord,
  onRemove,
}: EventLogProps): JSX.Element {
  const [flash, setFlash] = useState<Flash>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A flash outliving the screen it belongs to would set state on a card that
  // is gone; the timer is cleared with the card.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    []
  );

  const tap = async (stamp: CookStamp): Promise<void> => {
    const logged = await onRecord(stamp.key);
    setFlash({ key: stamp.key, logged });
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setFlash(null), FLASH_MS);
  };

  // Newest first, without disturbing the list the caller holds.
  const newestFirst = [...events].sort((one, other) => other.at.getTime() - one.at.getTime());

  return (
    <Card data-testid="cook-log-card" sx={{ padding: '12px 14px 8px' }}>
      <Typography
        component="h2"
        sx={theme => ({
          fontSize: '0.6875rem',
          fontWeight: 700,
          letterSpacing: '0.12em',
          lineHeight: 1.3,
          color: theme.design.textSecondary,
          marginBottom: '8px',
        })}
      >
        COOK LOG
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
        }}
      >
        {stamps.map(stamp => {
          const flashing = flash?.key === stamp.key ? flash : null;
          return (
            <Box
              key={stamp.key}
              component="button"
              type="button"
              disabled={!smoking}
              data-testid={`cook-stamp-${stamp.key}`}
              onClick={() => void tap(stamp)}
              sx={theme => ({
                height: '60px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                cursor: smoking ? 'pointer' : 'default',
                borderRadius: '10px',
                border: `1px solid ${theme.design.border}`,
                backgroundColor: theme.design.surfaceAlt,
                color: theme.design.text,
                font: 'inherit',
                fontSize: '0.8125rem',
                fontWeight: 600,
                // Present but plainly out of use: a disabled row that vanished
                // would move every button under the thumb that reaches for it.
                opacity: smoking ? 1 : 0.4,
              })}
            >
              {/* Colour alone says nothing to anybody who cannot see it, so the
                  dot only reinforces the label beside it. */}
              <Box
                data-testid={`cook-stamp-tone-${stamp.key}`}
                sx={theme => ({
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: toneColor(stamp.tone, theme.design),
                })}
              />
              <Box component="span">
                {flashing ? (flashing.logged ? 'Logged' : 'Not logged') : stamp.label}
              </Box>
            </Box>
          );
        })}
      </Box>
      {newestFirst.length === 0 ? (
        <Typography
          variant="body2"
          sx={theme => ({ color: theme.design.textSecondary, padding: '12px 2px' })}
        >
          Nothing logged yet.
        </Typography>
      ) : (
        <Box sx={{ marginTop: '10px' }}>
          {newestFirst.map(entry => (
            <Box
              key={entry._id}
              data-testid="cook-event-row"
              sx={theme => ({
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 2px',
                borderTop: `1px solid ${theme.design.border}`,
              })}
            >
              <Box
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
                onClick={() => void onRemove(entry._id)}
              >
                <CloseIcon fontSize="inherit" />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}
    </Card>
  );
}
