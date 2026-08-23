/**
 * The question asked when the smoker is lit over a cook that was auto-stopped.
 *
 * It says what happened — the previous cook was stopped by itself because its
 * readings dried up, and nobody ever pressed End Smoke — and offers the one
 * action that recovers from it: finish that cook, keeping the time it really
 * ended, and start a fresh session for the one being lit now. Declining leaves
 * the session and the smoking flag untouched, which is what the dialog does on
 * a backdrop tap or the Escape key as well.
 */
import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';

export interface StaleCookDialogProps {
  /** Whether the question is being asked. */
  open: boolean;
  /** Whether the one-tap recovery is in flight (both answers wait for it). */
  working?: boolean;
  /** Finish the previous cook and start a fresh session. */
  onConfirm: () => void;
  /** Leave everything as it is. */
  onCancel: () => void;
}

export function StaleCookDialog({
  open,
  working = false,
  onConfirm,
  onCancel,
}: StaleCookDialogProps): JSX.Element {
  return (
    <Dialog
      open={open}
      // A dismissal by any route is the same answer as pressing Keep session:
      // nothing changes.
      onClose={() => (working ? undefined : onCancel())}
      aria-labelledby="stale-cook-dialog-title"
      aria-describedby="stale-cook-dialog-description"
      PaperProps={{ 'data-testid': 'stale-cook-dialog' } as Record<string, unknown>}
    >
      <DialogTitle id="stale-cook-dialog-title">Previous cook was auto-stopped</DialogTitle>
      <DialogContent>
        <DialogContentText id="stale-cook-dialog-description">
          The last cook stopped sending readings and was stopped for you, but it was never finished.
          Finish it now — keeping the time it really ended — and start a new session?
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button
          data-testid="stale-cook-cancel"
          onClick={onCancel}
          disabled={working}
          color="inherit"
        >
          Keep session
        </Button>
        <Button
          data-testid="stale-cook-confirm"
          onClick={onConfirm}
          disabled={working}
          variant="contained"
        >
          Finish &amp; start new
        </Button>
      </DialogActions>
    </Dialog>
  );
}
