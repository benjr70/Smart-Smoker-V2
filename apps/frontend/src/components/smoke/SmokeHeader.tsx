import { Box, Typography } from '@mui/material';
import React from 'react';
import { FlameIcon } from '../common/components/DesignIcons';

export interface SmokeHeaderProps {
  /**
   * What rides under the titles inside the header — the wizard's step control.
   * It belongs to the header rather than to the screen below it so that it
   * stays reachable however far into a step the user has scrolled.
   */
  children?: React.ReactNode;
}

/**
 * The smoke wizard's header: who the product is, what this screen is, and the
 * flame badge, pinned to the top of the screen.
 *
 * It is sticky rather than fixed, so it takes its own space in the column
 * instead of covering the step's first field — the same reason the bottom bar
 * reserves its height at the other end of the screen.
 */
export function SmokeHeader({ children }: SmokeHeaderProps): JSX.Element {
  return (
    <Box
      component="header"
      data-testid="smoke-header"
      sx={theme => ({
        position: 'sticky',
        top: 0,
        zIndex: theme.zIndex.appBar,
        // Its own surface, above the page background the step is laid on, so
        // that a step scrolling underneath it does not read through.
        backgroundColor: theme.design.surface,
        borderBottom: `1px solid ${theme.design.border}`,
        padding: '16px 16px 12px',
      })}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          marginBottom: '12px',
        }}
      >
        <Box>
          <Typography
            component="p"
            sx={theme => ({
              fontSize: '0.6875rem',
              fontWeight: 700,
              letterSpacing: '0.14em',
              lineHeight: 1.4,
              color: theme.design.textSecondary,
            })}
          >
            SMART SMOKER
          </Typography>
          <Typography
            component="h1"
            sx={theme => ({
              fontSize: '1.375rem',
              fontWeight: 700,
              lineHeight: 1.2,
              color: theme.design.text,
            })}
          >
            New Session
          </Typography>
        </Box>
        {/* Decoration, not a control: it says nothing the two lines beside it
            do not already say, so it is hidden from assistive technology
            rather than read out as a nameless graphic. */}
        <Box
          data-testid="smoke-header-badge"
          aria-hidden="true"
          sx={theme => ({
            flexShrink: 0,
            width: 44,
            height: 44,
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.design.accentTint,
            color: theme.design.accent,
          })}
        >
          <FlameIcon size={22} />
        </Box>
      </Box>
      {children}
    </Box>
  );
}
