import { Card, Grid, TextField } from '@mui/material';
import React from 'react';
import { useCurrentResource } from '../../../api';
import { DynamicList } from '../../common/components/DynamicList';
import { FormField, SectionHeading } from '../../common/components/FormField';
import { IMaskInput } from 'react-imask';
import { PostSmoke } from '../../../api/types';

type PostSmokeStepProps = {
  nextButton: JSX.Element;
};

export const PostSmokeStep: React.FC<PostSmokeStepProps> = ({ nextButton }) => {
  const [postSmokeState, setPostSmokeState] = useCurrentResource<PostSmoke>({
    initialValue: {
      restTime: '',
      steps: [''],
      notes: '',
    },
    load: client => client.postSmoke.getCurrent(),
    save: (client, value) => client.postSmoke.saveCurrent(value),
    loadErrorMessage: 'Could not load post-smoke details.',
    saveErrorMessage: 'Could not save post-smoke details.',
  });

  return (
    // The same column of cards the other two steps are laid out in: how the
    // meat rested, what was done to it afterwards, and how it went.
    <Grid
      item
      xs={12}
      sx={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}
    >
      <Card data-testid="postsmoke-details-card" sx={{ padding: '14px' }}>
        <FormField label="Rest Time" htmlFor="postsmoke-rest-time">
          <TextField
            id="postsmoke-rest-time"
            fullWidth
            size="small"
            value={postSmokeState.restTime}
            // The mask rewrites what is typed, which without a word about the
            // format reads as the field rejecting the number: this is what the
            // design puts under it.
            helperText="Hours and minutes, as HH:MM"
            onChange={(event: any) =>
              setPostSmokeState({ ...postSmokeState, restTime: event.target.value })
            }
            inputProps={{ 'data-testid': 'postsmoke-rest-time-input' }}
            InputProps={{
              inputComponent: TextMaskCustom as any,
            }}
          />
        </FormField>
      </Card>
      <Card
        data-testid="postsmoke-steps-card"
        sx={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}
      >
        <SectionHeading>Post-Smoke Steps</SectionHeading>
        <DynamicList
          newline={() =>
            setPostSmokeState({ ...postSmokeState, steps: [...postSmokeState.steps, ''] })
          }
          removeLine={(index: number) =>
            setPostSmokeState({
              ...postSmokeState,
              steps: postSmokeState.steps.filter((_, i) => i !== index),
            })
          }
          steps={postSmokeState.steps}
          testIdPrefix="postsmoke-step"
          onListChange={(step, index) =>
            setPostSmokeState({
              ...postSmokeState,
              steps: postSmokeState.steps.map((s, i) => (i === index ? step : s)),
            })
          }
        />
      </Card>
      <Card data-testid="postsmoke-notes-card" sx={{ padding: '14px' }}>
        <FormField label="Notes" htmlFor="postsmoke-notes">
          <TextField
            id="postsmoke-notes"
            fullWidth
            placeholder="How did it turn out?"
            multiline
            inputProps={{ 'data-testid': 'postsmoke-notes-input' }}
            value={postSmokeState.notes}
            onChange={(event: any) =>
              setPostSmokeState({ ...postSmokeState, notes: event.target.value })
            }
            rows={4}
          />
        </FormField>
      </Card>
      <Grid container sx={{ paddingBottom: '8px' }}>
        {nextButton}
      </Grid>
    </Grid>
  );
};

interface CustomProps {
  onChange: (event: { target: { name: string; value: string } }) => void;
  name: string;
}

const TextMaskCustom = React.forwardRef<HTMLElement, CustomProps>(
  function TextMaskCustom(props, ref) {
    const { onChange, ...other } = props;
    return (
      <IMaskInput
        {...other}
        mask="00:00"
        definitions={{
          '#': /[1-9]/,
        }}
        onAccept={(value: any) => onChange({ target: { name: props.name, value } })}
        overwrite
      />
    );
  }
);
