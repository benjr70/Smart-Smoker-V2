import { Autocomplete, Box, Card, Grid, MenuItem, Select, TextField } from '@mui/material';
import React from 'react';
import { useCurrentResource } from '../../../api';
import { DynamicList } from '../../common/components/DynamicList';
import { FormField, SectionHeading } from '../../common/components/FormField';
import { WeightUnits } from '../../common/interfaces/enums';
import { PreSmoke } from '../../../api/types';

/**
 * The cuts the picker offers, in the design's order.
 *
 * Suggestions, not permitted values: the picker is free-text, so a cook on a
 * cut nobody listed is recorded the same way as a brisket. The three the app
 * used to offer left almost every common cook typing its own — the same
 * omission the wood picker had before the smoke step's slice.
 */
const MEAT_TYPES = ['Brisket', 'Pork Butt', 'Ribs', 'Chicken', 'Turkey', 'Salmon'];

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
    // One column of cards down the screen, as the smoke step beside it is laid
    // out: the cut being cooked, how it is being prepared, and anything else
    // worth saying about it. The column owns every gap, so no card carries a
    // margin and none of them has to know what it is next to.
    <Grid
      item
      xs={12}
      sx={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}
    >
      <Card
        data-testid="presmoke-details-card"
        sx={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}
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
            // emptying the field first. Six cuts are a list, not a search, so
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
                <MenuItem
                  key={unit}
                  value={unit}
                  data-testid={`presmoke-weight-unit-option-${unit}`}
                >
                  {unit}
                </MenuItem>
              ))}
            </Select>
          </FormField>
        </Box>
      </Card>
      <Card
        data-testid="presmoke-steps-card"
        sx={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}
      >
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
      </Card>
      <Card data-testid="presmoke-notes-card" sx={{ padding: '14px' }}>
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
      </Card>
      <Grid container sx={{ paddingBottom: '8px' }}>
        {props.nextButton}
      </Grid>
    </Grid>
  );
}
