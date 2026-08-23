/**
 * The question the panel asks when the smoker is lit over a cook that was
 * auto-stopped.
 *
 * It says what happened — the last cook stopped sending readings and was
 * stopped for you, and nobody ever finished it — and offers the one action that
 * recovers from it: finish that cook, keeping the time it really ended, and
 * start a fresh session for the one being lit now. Declining leaves the session
 * and the smoking flag untouched.
 *
 * It is sized for the 800×480 panel and a thumb: both answers are full-height
 * touch targets, and neither is a small word in a corner.
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
import { useDesign } from '../../theme/useDesign';

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
  const design = useDesign();
  return (
    <Dialog
      open={open}
      // A dismissal by any route is the same answer as Keep session: nothing
      // changes.
      onClose={() => (working ? undefined : onCancel())}
      aria-labelledby="stale-cook-dialog-title"
      aria-describedby="stale-cook-dialog-description"
      PaperProps={{ 'data-testid': 'stale-cook-dialog' } as Record<string, unknown>}
    >
      <DialogTitle id="stale-cook-dialog-title" sx={{ fontSize: 20, color: design.text }}>
        Previous cook was auto-stopped
      </DialogTitle>
      <DialogContent>
        <DialogContentText
          id="stale-cook-dialog-description"
          sx={{ fontSize: 16, color: design.textSecondary }}
        >
          The last cook stopped sending readings and was stopped for you, but it was never finished.
          Finish it now — keeping the time it really ended — and start a new session?
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ padding: '12px 16px', gap: '10px' }}>
        <Button
          data-testid="stale-cook-cancel"
          onClick={onCancel}
          disabled={working}
          variant="outlined"
          sx={{ minHeight: 48, minWidth: 140, borderColor: design.border, color: design.text }}
        >
          Keep session
        </Button>
        <Button
          data-testid="stale-cook-confirm"
          onClick={onConfirm}
          disabled={working}
          variant="contained"
          sx={{ minHeight: 48, minWidth: 180 }}
        >
          Finish &amp; start new
        </Button>
      </DialogActions>
    </Dialog>
  );
}
