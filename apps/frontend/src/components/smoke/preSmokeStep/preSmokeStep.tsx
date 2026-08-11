import { Autocomplete, Box, Grid, MenuItem, Select, TextField } from '@mui/material';
import React from 'react';
import { useCurrentResource } from '../../../api';
import { DynamicList } from '../../common/components/DynamicList';
import { FormField, SectionHeading } from '../../common/components/FormField';
import { WeightUnits } from '../../common/interfaces/enums';
import { PreSmoke } from '../../../api/types';

/**
 * The cuts the picker offers, exactly as the design lists them and in its order.
 *
 * Suggestions, not permitted values: the picker is free-text, so a cook on a
 * cut nobody listed is recorded the same way as a brisket. The three the app
 * used to offer left almost every common cook typing its own — the same
 * omission the wood picker had before the smoke step's slice. "Other" is the
 * design's own last entry, and it behaves like the rest of them: it is a string
 * the field can hold, and a pitmaster who means something more specific types it
 * over.
 */
const MEAT_TYPES = [
  'Brisket',
  'Ribs',
  'Pork Shoulder',
  'Turkey',
  'Chicken',
  'Chuck Roast',
  'Other',
];

type PreSmokeStepProps = {
  nextButton: JSX.Element;
};

export function PreSmokeStep(props: PreSmokeStepProps) {
  const [preSmokeState, setPreSmokeState] = useCurrentResource<PreSmoke>({
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
    // One flat column of fields down the screen, as the design draws it: the cut
    // being cooked, how it is being prepared, and anything else worth saying
    // about it. No card chrome — a card is how the design separates the live
    // smoke's readings, its chart and its details from one another, and a form
    // that is read top to bottom in one pass has nothing to separate. The column
    // owns every gap, so no field carries a margin of its own.
    <Grid
      item
      xs={12}
      sx={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%' }}
    >
      <FormField label="Name" htmlFor="presmoke-name">
        <TextField
          id="presmoke-name"
          fullWidth
          size="small"
          placeholder="Sunday brisket"
          value={preSmokeState.name}
          inputProps={{ 'data-testid': 'presmoke-name-input' }}
          onChange={(event: any) =>
            setPreSmokeState({ ...preSmokeState, name: event.target.value })
          }
        />
      </FormField>
      <FormField label="Meat Type" htmlFor="presmoke-meat-type">
        <Autocomplete
          id="presmoke-meat-type"
          fullWidth
          size="small"
          freeSolo
          forcePopupIcon
          // A select offers all of its choices whenever it is opened.
          // Material-UI narrows a free-text picker's list to what matches the
          // field, which on a cook already recorded as a brisket leaves
          // "Brisket" as the only cut on offer — so changing one's mind means
          // emptying the field first. Seven cuts are a list, not a search, so
          // the whole list is always shown.
          filterOptions={options => options}
          options={MEAT_TYPES}
          inputValue={preSmokeState.meatType}
          onInputChange={(event, newInputValue) => {
            setPreSmokeState({ ...preSmokeState, meatType: newInputValue });
          }}
          renderInput={params => (
            <TextField
              {...params}
              placeholder="Brisket"
              inputProps={{ ...params.inputProps, 'data-testid': 'presmoke-meat-type-input' }}
            />
          )}
        />
      </FormField>
      {/* The weight and the unit it is measured in are one answer, so they
            share a row: the number takes the room, the unit takes what it
            needs. */}
      <Box sx={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
        <FormField label="Weight" htmlFor="presmoke-weight" sx={{ flex: 1, minWidth: 0 }}>
          <TextField
            id="presmoke-weight"
            type="number"
            fullWidth
            size="small"
            placeholder="0"
            value={preSmokeState.weight.weight ? preSmokeState.weight.weight : ''}
            inputProps={{ 'data-testid': 'presmoke-weight-input' }}
            onChange={(event: any) =>
              setPreSmokeState({
                ...preSmokeState,
                weight: { ...preSmokeState.weight, weight: event.target.value },
              })
            }
          />
        </FormField>
        <FormField label="Unit" labelId="presmoke-weight-unit-label" sx={{ width: '96px' }}>
          <Select
            labelId="presmoke-weight-unit-label"
            size="small"
            value={preSmokeState.weight.unit}
            // The rendered display element is what a test clicks to open the
            // unit menu; `SelectDisplayProps` is typed as plain HTML
            // attributes, which do not admit `data-*` keys, hence the cast.
            SelectDisplayProps={
              {
                'data-testid': 'presmoke-weight-unit-select',
              } as React.HTMLAttributes<HTMLDivElement>
            }
            onChange={(event: any) =>
              setPreSmokeState({
                ...preSmokeState,
                weight: { ...preSmokeState.weight, unit: event.target.value },
              })
            }
          >
            {Object.values(WeightUnits).map(unit => (
              <MenuItem key={unit} value={unit} data-testid={`presmoke-weight-unit-option-${unit}`}>
                {unit}
              </MenuItem>
            ))}
          </Select>
        </FormField>
      </Box>
      {/* The plan and its heading are one field of the form, spaced the way a
          label sits above its control. */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <SectionHeading>Prep Steps</SectionHeading>
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
          testIdPrefix="presmoke-step"
          onListChange={(step, index) =>
            setPreSmokeState({
              ...preSmokeState,
              steps: preSmokeState.steps.map((s, i) => (i === index ? step : s)),
            })
          }
        />
      </Box>
      <FormField label="Notes" htmlFor="presmoke-notes">
        <TextField
          id="presmoke-notes"
          fullWidth
          placeholder="Anything worth remembering about this cut"
          multiline
          inputProps={{ 'data-testid': 'presmoke-notes-input' }}
          value={preSmokeState.notes}
          onChange={(event: any) =>
            setPreSmokeState({ ...preSmokeState, notes: event.target.value })
          }
          rows={4}
        />
      </FormField>
      {/* The step's one action, at the foot of it and against the right-hand
          edge, which is where the design ends every step. */}
      <Grid container flexDirection="row-reverse" sx={{ paddingBottom: '8px' }}>
        {props.nextButton}
      </Grid>
    </Grid>
  );
}
