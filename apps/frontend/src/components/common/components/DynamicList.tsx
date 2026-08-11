import { Box, Button, TextField } from '@mui/material';
import React from 'react';

interface dynamicListProps {
  onListChange: (step: string, index: number) => void;
  newline: () => void;
  removeLine: (index: number) => void;
  steps: string[];
  /**
   * Prefix for the rows' test ids, so a caller's list is addressable on a page
   * that renders more than one (e.g. `presmoke-step`). Every row shares the same
   * ids; tests scope them by row.
   *
   * Required rather than defaulted: two lists sharing one generic prefix are
   * indistinguishable to a test, and a default is exactly how that collision
   * gets shipped unnoticed. Naming the list is the caller's job.
   */
  testIdPrefix: string;
}

/**
 * A numbered list of steps that can be added to and taken from — the prep plan
 * on the pre-smoke step, the wrap-up on the post-smoke one.
 *
 * The design's affordances are a number, the step, and a "×" that drops that
 * step, with one "+ Add Step" under the list. What this replaces put the add
 * control *in the last row*, in the place every other row kept its remove
 * control: the final step of a plan therefore had no way to be dropped, so a
 * cook with nothing to prepare was left with a blank row it could not get rid
 * of, and the control under a thumb changed meaning as the list grew.
 *
 * An emptied list renders no rows and keeps its "+ Add Step", which is how it
 * is started again — a list of nothing is a legitimate answer here.
 */
export function DynamicList(props: dynamicListProps): JSX.Element {
  const testId = (suffix: string) => `${props.testIdPrefix}-${suffix}`;
  const steps = props.steps ?? [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {steps.map((step, index) => (
        <Box
          key={`dynamic-list-item${index}`}
          data-testid={testId('row')}
          sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}
        >
          {/* The position in the plan, not decoration: a step is referred to by
              its number ("skip step 3"), and the remove control beside it is
              named after the same number. */}
          <Box
            data-testid={testId('number')}
            sx={theme => ({
              flexShrink: 0,
              width: 24,
              height: 24,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: theme.design.accentTint,
              color: theme.design.accent,
            })}
          >
            {index + 1}
          </Box>
          <TextField
            fullWidth
            size="small"
            placeholder="What happens at this step"
            value={step}
            onChange={event => {
              props.onListChange(event.target.value, index);
            }}
            inputProps={{ 'data-testid': testId('input'), 'aria-label': `Step ${index + 1}` }}
            multiline
          />
          <Box
            component="button"
            type="button"
            aria-label={`Remove step ${index + 1}`}
            data-testid={testId('remove-button')}
            onClick={() => props.removeLine(index)}
            sx={theme => ({
              flexShrink: 0,
              width: 28,
              height: 28,
              padding: 0,
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              background: 'transparent',
              fontSize: 18,
              lineHeight: 1,
              color: theme.design.textSecondary,
              '&:hover': { color: theme.design.danger },
            })}
          >
            {/* The glyph says nothing to a screen reader, which is what the
                label above it is for. */}
            <span aria-hidden="true">×</span>
          </Box>
        </Box>
      ))}
      {/* One control for the list rather than one per row: what it does does not
          depend on which row happens to be last. */}
      <Button
        variant="text"
        size="small"
        onClick={props.newline}
        data-testid={testId('add-button')}
        sx={{ alignSelf: 'flex-start', textTransform: 'none', paddingLeft: 0 }}
      >
        + Add Step
      </Button>
    </Box>
  );
}
