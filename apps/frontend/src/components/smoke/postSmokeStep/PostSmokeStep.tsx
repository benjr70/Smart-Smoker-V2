import { Grid, TextField } from '@mui/material';
import React from 'react';
import { useCurrentResource } from '../../../api';
import { DynamicList } from '../../common/components/DynamicList';
import { IMaskInput } from 'react-imask';
import { PostSmoke } from '../../../api/types';
import './postSmokeStep.style.css';

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
    <Grid item sx={{ width: '100%' }}>
      <TextField
        sx={{ marginBottom: '10px' }}
        id="standard-basic"
        label="Rest Time"
        variant="outlined"
        value={postSmokeState.restTime}
        onChange={(event: any) =>
          setPostSmokeState({ ...postSmokeState, restTime: event.target.value })
        }
        inputProps={{ 'data-testid': 'postsmoke-rest-time-input' }}
        InputProps={{
          inputComponent: TextMaskCustom as any,
        }}
      />
      <Grid>
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
          onListChange={(step, index) =>
            setPostSmokeState({
              ...postSmokeState,
              steps: postSmokeState.steps.map((s, i) => (i === index ? step : s)),
            })
          }
        />
      </Grid>
      <Grid container direction="row" justifyContent="space-around">
        <TextField
          sx={{
            marginTop: '10px',
            marginBottom: '10px',
            width: '100%',
          }}
          id="outlined-multiline-static"
          label="Notes"
          multiline
          value={postSmokeState.notes}
          onChange={(event: any) =>
            setPostSmokeState({ ...postSmokeState, notes: event.target.value })
          }
          rows={4}
        />
      </Grid>
      <Grid container flexDirection="row-reverse">
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
