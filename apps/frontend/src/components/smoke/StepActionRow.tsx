import { Grid } from '@mui/material';
import React from 'react';
import { VOICE_FILL_BUTTON_CLEARANCE } from '../../voiceFill';

/** What the row keeps under the action on any step, the button or no button. */
const FOOT_GAP = 8;

export interface StepActionRowProps {
  /** Whether the Voice fill button is offered on the step this row ends. */
  voiceFillOffered: boolean;
  /** The step's one action. */
  children: React.ReactNode;
}

/**
 * The step's one action, at the foot of it and against the right-hand edge,
 * which is where the design ends every step. The Voice fill button is pinned
 * over that same corner, so where it is offered the step ends with room for it
 * underneath: scrolled to its foot, the action is clear of the button.
 */
export function StepActionRow({ voiceFillOffered, children }: StepActionRowProps): JSX.Element {
  return (
    <Grid
      container
      flexDirection="row-reverse"
      sx={{
        paddingBottom: `${(voiceFillOffered ? VOICE_FILL_BUTTON_CLEARANCE : 0) + FOOT_GAP}px`,
      }}
    >
      {children}
    </Grid>
  );
}
