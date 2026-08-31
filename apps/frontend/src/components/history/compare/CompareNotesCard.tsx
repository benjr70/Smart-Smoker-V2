/**
 * What was written during each cook, side by side under section 2.
 *
 * Each note is prefixed with its cook's letter in that cook's colour, so an
 * observation is attributable at a glance — the same rule the chart's lines and
 * the summary's names follow.
 */
import { Box, Card } from '@mui/material';
import React from 'react';
import { CompareCook } from '../../../api';
import { CompareSlotColors } from './compareColors';

export interface CompareNotesCardProps {
  a: CompareCook;
  b: CompareCook;
  colors: CompareSlotColors;
}

export function CompareNotesCard({ a, b, colors }: CompareNotesCardProps): JSX.Element {
  const rows = [
    { side: 'A' as const, cook: a, color: colors.a },
    { side: 'B' as const, cook: b, color: colors.b },
  ];

  return (
    <Card data-testid="compare-smoke-notes" sx={{ padding: '14px 16px 16px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '10px' }}>
        <Box
          component="span"
          aria-hidden="true"
          sx={theme => ({
            width: 22,
            height: 22,
            borderRadius: '7px',
            flexShrink: 0,
            backgroundColor: theme.design.surfaceAlt,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.75rem',
            fontWeight: 800,
            color: theme.design.textSecondary,
          })}
        >
          2
        </Box>
        <Box
          component="span"
          sx={theme => ({
            fontSize: '0.6875rem',
            fontWeight: 600,
            letterSpacing: '0.05em',
            color: theme.design.textSecondary,
          })}
        >
          SMOKE NOTES
        </Box>
      </Box>
      {rows.map(row => {
        const note = row.cook.smokeProfile.notes?.trim();
        return (
          <Box key={row.side} sx={{ display: 'flex', gap: '10px', padding: '8px 0' }}>
            <Box
              component="span"
              data-testid={`compare-note-prefix-${row.side.toLowerCase()}`}
              sx={{
                width: 16,
                flexShrink: 0,
                fontSize: '0.75rem',
                fontWeight: 800,
                color: row.color,
              }}
            >
              {row.side}
            </Box>
            <Box
              component="span"
              data-testid={`compare-note-${row.side.toLowerCase()}`}
              sx={theme => ({
                flex: 1,
                fontSize: '0.8125rem',
                lineHeight: 1.5,
                // A cook nobody wrote about says so, in the quieter colour: an
                // empty line beside a letter reads as a note that failed to load.
                color: note ? theme.design.text : theme.design.textSecondary,
              })}
            >
              {note || 'No notes'}
            </Box>
          </Box>
        );
      })}
    </Card>
  );
}
