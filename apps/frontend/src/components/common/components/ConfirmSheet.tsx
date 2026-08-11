import { Box, Button, Drawer, Typography } from '@mui/material';
import React from 'react';

export interface ConfirmSheetProps {
  /** Whether the sheet is up. */
  open: boolean;
  /** The question, which also names the sheet for assistive technology. */
  title: string;
  /** What confirming does, spelled out — the consequences, in the user's words. */
  children: React.ReactNode;
  /** The confirming button's words. */
  confirmLabel: string;
  /** The declining button's words. */
  cancelLabel: string;
  /** Called when the confirming button is pressed. */
  onConfirm: () => void;
  /** Called for every way out that is not confirming: the button, Escape, the backdrop. */
  onCancel: () => void;
  /** Addresses the sheet's own element and its two buttons in tests and journeys. */
  testId?: string;
}

/**
 * The design's confirmation sheet: a panel that rises from the bottom of the
 * screen, asks one question, and offers the destructive answer and the safe
 * one.
 *
 * It is a Material-UI `Drawer` underneath rather than a hand-rolled overlay
 * because everything that makes a modal safe is already in it and is tedious to
 * get right: the focus is trapped inside the sheet and returned when it closes,
 * the page behind is inert and hidden from assistive technology, Escape
 * dismisses, and the backdrop dismisses. The design's contribution is the
 * shape — the rounded top, the grab handle, the stacked buttons — which is
 * styling on top of that.
 *
 * The sheet holds no decision of its own: it is told whether it is open and
 * reports which answer was given, so what is being confirmed stays with the
 * screen that knows what to do about it.
 */
export function ConfirmSheet({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  testId = 'confirm-sheet',
}: ConfirmSheetProps): JSX.Element {
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onCancel}
      // The backdrop is a way out of the sheet, so it is addressable like the
      // two buttons are.
      ModalProps={{ BackdropProps: { 'data-testid': `${testId}-backdrop` } }}
      PaperProps={{
        // The drawer's own wrapper is presentational; the panel is the dialog,
        // so the role and the name go on the panel — otherwise assistive
        // technology is handed a modal with nothing modal in it.
        role: 'dialog',
        'aria-modal': true,
        'aria-label': title,
        'data-testid': testId,
        sx: theme => ({
          backgroundColor: theme.design.surface,
          backgroundImage: 'none',
          borderRadius: '20px 20px 0 0',
          padding: '22px 20px calc(22px + env(safe-area-inset-bottom))',
          maxWidth: 480,
          marginX: 'auto',
        }),
      }}
    >
      {/* The grab handle: the design's cue that this panel came up from the
          bottom edge. It says nothing, so it says nothing to a screen reader. */}
      <Box
        aria-hidden="true"
        sx={theme => ({
          width: 38,
          height: 4,
          borderRadius: 2,
          margin: '0 auto 18px',
          backgroundColor: theme.design.border,
        })}
      />
      <Typography
        component="h2"
        sx={theme => ({
          fontSize: '1.125rem',
          fontWeight: 800,
          marginBottom: '6px',
          color: theme.design.text,
        })}
      >
        {title}
      </Typography>
      <Typography
        component="div"
        sx={theme => ({
          fontSize: '0.875rem',
          lineHeight: 1.55,
          marginBottom: '20px',
          color: theme.design.textSecondary,
        })}
      >
        {children}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
        <Button
          variant="contained"
          color="error"
          data-testid={`${testId}-confirm`}
          onClick={onConfirm}
          sx={{ height: 50, borderRadius: '12px', fontSize: '0.9375rem', fontWeight: 700 }}
        >
          {confirmLabel}
        </Button>
        <Button
          variant="outlined"
          data-testid={`${testId}-cancel`}
          onClick={onCancel}
          sx={theme => ({
            height: 50,
            borderRadius: '12px',
            fontSize: '0.9375rem',
            fontWeight: 600,
            color: theme.design.text,
            borderColor: theme.design.border,
          })}
        >
          {cancelLabel}
        </Button>
      </Box>
    </Drawer>
  );
}
