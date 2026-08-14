import { Box } from '@mui/material';
import React from 'react';

export interface StepListProps {
  /** What the steps are steps of — `Prep Steps`, `Post Steps`. */
  label: string;
  steps: string[];
}

/**
 * The design's numbered step list inside a detail section: an ordered list,
 * because that is what it is, with the design's small numbered badges.
 *
 * A cook with no steps written shows no list and no label: an empty "Prep
 * Steps" heading would ask the reader to wonder what is missing, and nothing
 * is.
 */
export function StepList({ label, steps }: StepListProps): JSX.Element | null {
  if (steps.length === 0) return null;

  return (
    <Box data-testid="step-list">
      <Box
        component="span"
        sx={theme => ({
          display: 'block',
          marginBottom: '6px',
          fontSize: '0.6875rem',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: theme.design.textSecondary,
        })}
      >
        {label}
      </Box>
      <Box
        component="ol"
        sx={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {steps.map((step, index) => (
          <Box
            component="li"
            key={`${index}-${step}`}
            data-testid="step-list-step"
            sx={theme => ({
              display: 'flex',
              alignItems: 'baseline',
              gap: 1,
              fontSize: '0.875rem',
              color: theme.design.text,
            })}
          >
            <Box
              component="span"
              sx={theme => ({
                flexShrink: 0,
                fontSize: '0.75rem',
                fontWeight: 700,
                color: theme.design.accent,
              })}
            >
              {index + 1}
            </Box>
            {step}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
