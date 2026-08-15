import { Box } from '@mui/material';
import React from 'react';

export interface NoteBlockProps {
  /** What the note is about — `Notes`, `Smoke Notes`. */
  label: string;
  note: string | undefined;
}

/**
 * The design's note block inside a detail section: the words written about a
 * phase of the cook, quiet against the section's own fields.
 *
 * A cook nobody wrote about shows no block at all — an empty labelled box would
 * read as something lost, and nothing was.
 */
export function NoteBlock({ label, note }: NoteBlockProps): JSX.Element | null {
  const written = note?.trim();
  if (!written) return null;

  return (
    <Box
      data-testid="note-block"
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
          marginBottom: '4px',
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
        component="p"
        sx={theme => ({
          margin: 0,
          fontSize: '0.875rem',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          color: theme.design.text,
        })}
      >
        {written}
      </Box>
    </Box>
  );
}
