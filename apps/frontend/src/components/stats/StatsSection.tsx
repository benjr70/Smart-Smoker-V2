import { Box, Typography } from '@mui/material';
import React from 'react';

export interface StatsSectionProps {
  testId: string;
  /** What the section is about: `Personal records`. */
  title: string;
  /** An aside on the right of the title, for sections that have one. */
  note?: string;
  children: React.ReactNode;
}

/**
 * The card chrome every section below the headline figures shares: a heading, an
 * optional right-aligned aside, and whatever rows the section is made of.
 *
 * Records, meats, woods and scores are four different lists of very different
 * things, but they are the same object on the screen — so the chrome is written
 * once here and the sections only decide what goes inside it.
 */
export function StatsSection({ testId, title, note, children }: StatsSectionProps): JSX.Element {
  return (
    <Box
      data-testid={testId}
      sx={theme => ({
        padding: '16px',
        borderRadius: '16px',
        border: `1px solid ${theme.design.border}`,
        backgroundColor: theme.design.surface,
      })}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 1.5,
          marginBottom: '12px',
        }}
      >
        <Typography
          component="h2"
          sx={theme => ({
            fontSize: '0.9375rem',
            fontWeight: 700,
            color: theme.design.text,
          })}
        >
          {title}
        </Typography>
        {note !== undefined && (
          <Typography
            component="p"
            data-testid={`${testId}-note`}
            sx={theme => ({
              fontSize: '0.75rem',
              color: theme.design.textSecondary,
              textAlign: 'right',
            })}
          >
            {note}
          </Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>{children}</Box>
    </Box>
  );
}
