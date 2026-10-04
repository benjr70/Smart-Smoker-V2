import { Box, Button, Theme } from '@mui/material';
import React from 'react';
import { BOTTOM_BAR_HEIGHT } from '../components/bottomBar/bottombar';
import { MicIcon } from '../components/common/components/DesignIcons';

/** How far the button and the toast keep from the edges they sit against. */
const EDGE_GAP = 16;

/** How tall the button is, and the toast that takes its place. */
const CONTROL_HEIGHT = 60;

/** Where the button and the toast sit: just clear of the navigation bar. */
const ABOVE_BOTTOM_BAR = `calc(${BOTTOM_BAR_HEIGHT + EDGE_GAP}px + env(safe-area-inset-bottom))`;

/**
 * The height the button covers at the foot of a screen, its gap included: what
 * a screen leaves clear under its last control so the button never sits on it.
 */
export const VOICE_FILL_BUTTON_CLEARANCE = CONTROL_HEIGHT + EDGE_GAP;

/** The widest Voice Fill draws anything: the sheet, and the toast inside it. */
export const VOICE_FILL_MAX_WIDTH = 480;

/** The small print Voice Fill names things in: a Review row's field, the sheet's screen. */
export const voiceFillCaptionSx = (theme: Theme) =>
  ({
    fontSize: '0.6875rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: theme.design.textSecondary,
  }) as const;

/** `N fields`, or `1 field`. */
export const fieldCount = (count: number): string => `${count} ${count === 1 ? 'field' : 'fields'}`;

export interface VoiceFillButtonProps {
  onClick: () => void;
}

/**
 * The Voice fill button: bottom-right, above the navigation bar, in the same
 * place on every screen that has one. Large, because it is tapped with greasy
 * hands next to a hot smoker.
 */
export function VoiceFillButton({ onClick }: VoiceFillButtonProps): JSX.Element {
  return (
    <Button
      variant="contained"
      onClick={onClick}
      data-testid="voice-fill-button"
      startIcon={<MicIcon size={24} />}
      sx={theme => ({
        position: 'fixed',
        right: EDGE_GAP,
        bottom: ABOVE_BOTTOM_BAR,
        zIndex: theme.zIndex.speedDial,
        height: CONTROL_HEIGHT,
        padding: '0 22px 0 18px',
        borderRadius: '30px',
        fontSize: '0.9375rem',
        fontWeight: 700,
        textTransform: 'none',
      })}
    >
      Voice fill
    </Button>
  );
}

export interface VoiceFillToastProps {
  /** How many fields the Ramble filled. */
  count: number;
  onUndo: () => void;
}

/**
 * What a fill leaves behind: how many fields it wrote, and the one tap that
 * takes all of them back. It carries the count and nothing of what was said.
 */
export function VoiceFillToast({ count, onUndo }: VoiceFillToastProps): JSX.Element {
  return (
    <Box
      role="status"
      data-testid="voice-fill-toast"
      sx={theme => ({
        position: 'fixed',
        left: EDGE_GAP,
        right: EDGE_GAP,
        bottom: ABOVE_BOTTOM_BAR,
        zIndex: theme.zIndex.snackbar,
        maxWidth: VOICE_FILL_MAX_WIDTH - 2 * EDGE_GAP,
        marginX: 'auto',
        minHeight: CONTROL_HEIGHT,
        borderRadius: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px 0 18px',
        // Inverted against the page, as the design draws it: the page's ink
        // for the panel and the page's background for what is written on it.
        backgroundColor: theme.design.text,
        color: theme.design.background,
        boxShadow: theme.shadows[6],
      })}
    >
      <Box component="span" sx={{ fontSize: '0.9375rem', fontWeight: 600 }}>
        Filled {fieldCount(count)} by voice
      </Box>
      <Button
        onClick={onUndo}
        data-testid="voice-fill-undo"
        sx={{
          height: 44,
          padding: '0 16px',
          borderRadius: '11px',
          color: 'inherit',
          fontSize: '0.9375rem',
          fontWeight: 800,
          textTransform: 'none',
          textDecoration: 'underline',
          '&:hover': { textDecoration: 'underline' },
        }}
      >
        Undo
      </Button>
    </Box>
  );
}
