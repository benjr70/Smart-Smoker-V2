import { Autocomplete, Grid, MenuItem, Select, TextField } from '@mui/material';
import React from 'react';
import { useCurrentResource } from '../../../api';
import { DynamicList } from '../../common/components/DynamicList';
import { WeightUnits } from '../../common/interfaces/enums';
import { preSmoke } from '../../common/interfaces/preSmoke';
import './preSmokeStep.style.css';

const meats = ['Ribs', 'Brisket', 'Turkey'];

type PreSmokeStepProps = {
  nextButton: JSX.Element;
};

export function PreSmokeStep(props: PreSmokeStepProps) {
  const [preSmokeState, setPreSmokeState] = useCurrentResource<preSmoke>({
    initialValue: {
      name: '',
      meatType: '',
      weight: {
        unit: WeightUnits.LB,
      },
      steps: [''],
      notes: '',
    },
    load: client => client.preSmoke.getCurrent(),
    save: (client, value) => client.preSmoke.saveCurrent(value),
    loadErrorMessage: 'Could not load pre-smoke details.',
    saveErrorMessage: 'Could not save pre-smoke details.',
  });

  return (
    <Grid item xs={11} flexDirection="column">
      <TextField
        sx={{ marginBottom: '10px' }}
        id="standard-basic"
        label="Name"
        variant="standard"
        value={preSmokeState.name}
        inputProps={{ 'data-testid': 'presmoke-name-input' }}
        onChange={(event: any) => setPreSmokeState({ ...preSmokeState, name: event.target.value })}
      />
      <Autocomplete
        sx={{ marginBottom: '10px' }}
        freeSolo
        options={meats.map(option => option)}
        inputValue={preSmokeState.meatType}
        onInputChange={(event, newInputValue) => {
          setPreSmokeState({ ...preSmokeState, meatType: newInputValue });
        }}
        renderInput={params => <TextField {...params} label="Meat Type" />}
      />
      <Grid className="weight">
        <TextField
          sx={{ marginBottom: '10px', marginRight: '10px' }}
          type="number"
          id="standard-basic"
          label="Weight"
          variant="standard"
          value={preSmokeState.weight.weight ? preSmokeState.weight.weight : ''}
          onChange={(event: any) =>
            setPreSmokeState({
              ...preSmokeState,
              weight: { ...preSmokeState.weight, weight: event.target.value },
            })
          }
        />
        <Select
          sx={{ marginBottom: '10px' }}
          labelId="demo-simple-select-label"
          id="demo-simple-select"
          value={preSmokeState.weight.unit}
          label="Age"
          onChange={(event: any) =>
            setPreSmokeState({
              ...preSmokeState,
              weight: { ...preSmokeState.weight, unit: event.target.value },
            })
          }
        >
          <MenuItem value={WeightUnits.LB}>LB</MenuItem>
          <MenuItem value={WeightUnits.OZ}>OZ</MenuItem>
        </Select>
      </Grid>
      <Grid flexDirection="column">
        <DynamicList
          newline={() =>
            setPreSmokeState({ ...preSmokeState, steps: [...preSmokeState.steps, ''] })
          }
          removeLine={(index: number) =>
            setPreSmokeState({
              ...preSmokeState,
              steps: preSmokeState.steps.filter((_, i) => i !== index),
            })
          }
          steps={preSmokeState.steps}
          onListChange={(step, index) =>
            setPreSmokeState({
              ...preSmokeState,
              steps: preSmokeState.steps.map((s, i) => (i === index ? step : s)),
            })
          }
        />
      </Grid>
      <TextField
        sx={{
          marginTop: '10px',
          marginBottom: '10px',
          width: '100%',
        }}
        id="outlined-multiline-static"
        label="Notes"
        multiline
        value={preSmokeState.notes}
        onChange={(event: any) => setPreSmokeState({ ...preSmokeState, notes: event.target.value })}
        rows={4}
      />
      <Grid container flexDirection="row-reverse">
        {props.nextButton}
      </Grid>
    </Grid>
  );
}
