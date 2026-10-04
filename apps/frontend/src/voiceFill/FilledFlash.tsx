import { Box, SxProps, Theme } from '@mui/material';
import React from 'react';

/**
 * How long a field Voice Fill has just written flashes, in ms: the two beats
 * drawn below, and the time after which the flash is put out.
 */
export const FLASH_MS = 2600;

/**
 * An accent-tinted halo that beats twice, so the eye is drawn to what changed
 * on a screen the cook was not looking at while they spoke.
 */
const flashSx = (theme: Theme) =>
  ({
    borderRadius: '10px',
    animation: `voice-filled-flash ${FLASH_MS / 2}ms ease-in-out 2`,
    '@keyframes voice-filled-flash': {
      '0%, 100%': { backgroundColor: 'transparent', boxShadow: '0 0 0 0 transparent' },
      '50%': {
        backgroundColor: theme.design.accentTint,
        boxShadow: `0 0 0 6px ${theme.design.accentTint}`,
      },
    },
  }) as const;

export interface FilledFlashProps {
  /** The screen value drawn inside: what the flash is marked with while it is on. */
  field: string;
  /** Whether that value has just been filled, and so is to flash. */
  flashing: boolean;
  /** How the field shares the room it is laid out in, e.g. its part of a row. */
  sx?: SxProps<Theme>;
  /** The field: its label and its control, however the screen draws them. */
  children: React.ReactNode;
}

/**
 * What a screen puts around each field Voice Fill can write, so the field
 * flashes when it has just been filled. The flash is Voice Fill's and is drawn
 * here, around the screen's own field, rather than by the field: a form that
 * has no Voice Fill draws its fields with nothing of it in them.
 */
export function FilledFlash({ field, flashing, sx, children }: FilledFlashProps): JSX.Element {
  return (
    <Box
      data-voice-filled={flashing ? field : undefined}
      sx={[...(Array.isArray(sx) ? sx : [sx]), ...(flashing ? [flashSx] : [])]}
    >
      {children}
    </Box>
  );
}
