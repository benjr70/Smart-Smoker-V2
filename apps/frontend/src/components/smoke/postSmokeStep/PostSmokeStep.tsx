import { Box, Grid, TextField } from '@mui/material';
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
    // The same flat column of fields the pre-smoke step is laid out in, and for
    // the same reason: how the meat rested, what was done to it afterwards, and
    // how it went, read top to bottom in one pass with no card chrome between
    // them.
    <Grid
      item
      xs={12}
      sx={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%' }}
    >
      {/* The format lives in the label, as the design writes it: the mask
          rewrites what is typed, and a field that says how it is written before
          it is typed into is not correcting anybody afterwards. */}
      <FormField label="Rest Time (HH:MM)" htmlFor="postsmoke-rest-time">
        <TextField
          id="postsmoke-rest-time"
          fullWidth
          size="small"
          value={postSmokeState.restTime}
          // What the design puts under the field: what the answer is for, rather
          // than a second telling of the format the label already gives.
          helperText="How long will you let it rest?"
          onChange={(event: any) =>
            setPostSmokeState({ ...postSmokeState, restTime: event.target.value })
          }
          inputProps={{ 'data-testid': 'postsmoke-rest-time-input' }}
          InputProps={{
            inputComponent: TextMaskCustom as any,
          }}
        />
      </FormField>
      {/* The wrap-up plan and its heading are one field of the form, spaced the
          way a label sits above its control. */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
      </Box>
      <FormField label="Notes" htmlFor="postsmoke-notes">
        <TextField
          id="postsmoke-notes"
          fullWidth
          multiline
          // A hint rather than a placeholder: a placeholder is gone the moment
          // anything is typed, and what this says — that the field is for how
          // the cook went, not for more of the wrap-up plan above it — is worth
          // as much to somebody halfway through writing it as to somebody
          // staring at an empty box.
          helperText="Final thoughts on the cook"
          inputProps={{ 'data-testid': 'postsmoke-notes-input' }}
          value={postSmokeState.notes}
          onChange={(event: any) =>
            setPostSmokeState({ ...postSmokeState, notes: event.target.value })
          }
          rows={4}
        />
      </FormField>
      {/* The step's one action, at the foot of it and against the right-hand
          edge, which is where the design ends every step. */}
      <Grid container flexDirection="row-reverse" sx={{ paddingBottom: '8px' }}>
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
