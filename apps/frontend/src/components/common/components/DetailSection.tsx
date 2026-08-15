import { Box, Card, Typography } from '@mui/material';
import React from 'react';

export interface DetailSectionProps {
  /** What the badge shows — a section number, or a mark like the ratings star. */
  number: string;
  title: string;
  children: React.ReactNode;
  testId?: string;
}

/**
 * One numbered section of the history detail, as the design draws it: a card
 * headed by an accent-tinted number badge and an uppercase title, with the
 * section's own content below.
 *
 * The heading is a real heading — the detail reads a past cook as a story, and
 * a story's chapters should be navigable as such — while the badge is
 * decoration beside it and says nothing to assistive technology.
 */
export function DetailSection({
  number,
  title,
  children,
  testId,
}: DetailSectionProps): JSX.Element {
  return (
    <Card data-testid={testId} sx={{ padding: '16px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, marginBottom: '12px' }}>
        <Box
          aria-hidden="true"
          data-testid="detail-section-number"
          sx={theme => ({
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: '8px',
            fontSize: '0.8125rem',
            fontWeight: 700,
            flexShrink: 0,
            backgroundColor: theme.design.accentTint,
            color: theme.design.accent,
          })}
        >
          {number}
        </Box>
        <Typography
          component="h2"
          sx={theme => ({
            fontSize: '0.8125rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: theme.design.text,
          })}
        >
          {title}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{children}</Box>
    </Card>
  );
}
