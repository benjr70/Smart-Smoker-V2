import { Box, Typography } from '@mui/material';
import React from 'react';
import { StatRecord } from '../../api';
import { NOT_RECORDED } from './statsFormat';

export interface StatRecordRowProps {
  testId: string;
  /** The record itself: `Highest rated`. */
  label: string;
  /** The record holder, or `null` for a record no cook has set yet. */
  record: StatRecord | null;
  /** The record's number, written the way that record reads. */
  format: (value: number) => string;
}

/**
 * One personal record: what the record is, which cook holds it, and the number
 * it was won with.
 *
 * A record nobody holds still gets its row. The four categories are the shape of
 * the card — dropping one because an older archive never stamped a chamber peak
 * would read as though the app had lost the category, rather than as though the
 * user had yet to set it.
 */
export function StatRecordRow({ testId, label, record, format }: StatRecordRowProps): JSX.Element {
  return (
    <Box
      data-testid={testId}
      sx={theme => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.5,
        padding: '10px 12px',
        borderRadius: '12px',
        backgroundColor: theme.design.surfaceAlt,
      })}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          component="p"
          sx={theme => ({
            fontSize: '0.6875rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: theme.design.textSecondary,
          })}
        >
          {label}
        </Typography>
        <Typography
          component="p"
          sx={theme => ({
            marginTop: '2px',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: theme.design.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          })}
        >
          {record === null ? 'Not set yet' : record.label}
        </Typography>
      </Box>
      <Typography
        component="p"
        sx={theme => ({
          flexShrink: 0,
          fontSize: '1rem',
          fontWeight: 700,
          color: theme.design.accent,
        })}
      >
        {record === null ? NOT_RECORDED : format(record.value)}
      </Typography>
    </Box>
  );
}
