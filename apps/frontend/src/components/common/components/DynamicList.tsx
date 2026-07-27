import { Button, Grid, TextField } from '@mui/material';
import './Dynamiclist.style.css';
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

export function DynamicList(props: dynamicListProps): JSX.Element {
  const testId = (suffix: string) => `${props.testIdPrefix}-${suffix}`;

  if (props.steps) {
    return (
      <>
        {props.steps.map((step, index) => (
          <Grid
            className="dynamicList"
            key={`dynamic-list-item${index}`}
            data-testid={testId('row')}
          >
            <Grid className="stepNumber">{index + 1}.</Grid>
            <TextField
              sx={{ marginRight: '10px' }}
              id="outlined-textarea"
              label="Step"
              placeholder="Placeholder"
              value={step}
              onChange={event => {
                props.onListChange(event.target.value, index);
              }}
              inputProps={{ 'data-testid': testId('input') }}
              multiline
            />
            {props.steps.length === index + 1 ? (
              <Button
                className="addButton"
                variant="outlined"
                size="small"
                onClick={props.newline}
                data-testid={testId('add-button')}
              >
                +
              </Button>
            ) : (
              <Button
                className="addButton"
                variant="outlined"
                size="small"
                onClick={() => props.removeLine(index)}
                data-testid={testId('remove-button')}
              >
                -
              </Button>
            )}
          </Grid>
        ))}
      </>
    );
  } else {
    return <></>;
  }
}
