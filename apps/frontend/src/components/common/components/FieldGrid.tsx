import { Box } from '@mui/material';
import React from 'react';
import { NOT_RECORDED } from '../timeFormat';

/** One cell of the grid: a label, and whatever the record holds under it. */
export interface GridField {
  label: string;
  /** The value on record; nothing, or only whitespace, reads as an em-dash. */
  value: string | null | undefined;
}

export interface FieldGridProps {
  fields: GridField[];
}

/**
 * The design's detail field grid: small muted labels over bold values, two to a
 * row inside a section card.
 *
 * A field whose value is not on record — a legacy cook with no timestamps, a
 * form left blank — shows an em-dash rather than nothing, because a blank cell
 * reads as a rendering mistake and an em-dash reads as an answer.
 */
export function FieldGrid({ fields }: FieldGridProps): JSX.Element {
  return (
    <Box
      data-testid="field-grid"
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '10px 12px',
      }}
    >
      {fields.map(field => (
        <Box
          key={field.label}
          data-testid="field-grid-field"
          sx={theme => ({
            padding: '10px 12px',
            borderRadius: '10px',
            backgroundColor: theme.design.surfaceAlt,
          })}
        >
          <Box
            component="span"
            sx={theme => ({
              display: 'block',
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: theme.design.textSecondary,
            })}
          >
            {field.label}
          </Box>
          <Box
            component="span"
            sx={theme => ({
              display: 'block',
              marginTop: '2px',
              fontSize: '0.9375rem',
              fontWeight: 700,
              color: theme.design.text,
            })}
          >
            {field.value?.trim() || NOT_RECORDED}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
