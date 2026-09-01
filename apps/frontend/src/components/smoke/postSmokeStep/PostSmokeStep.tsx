import { Box, Grid, TextField } from '@mui/material';
import React from 'react';
import { useCurrentResource } from '../../../api';
import { DynamicList } from '../../common/components/DynamicList';
import { FormField, SectionHeading } from '../../common/components/FormField';
import { IMaskInput } from 'react-imask';
import { PostSmoke } from '../../../api/types';
import { RestTimerCard } from './RestTimerCard';
import { useRestConditions } from './useRestConditions';

type PostSmokeStepProps = {
  nextButton: JSX.Element;
};

/**
 * What this step reads of the cook itself: the pull the Smoke → Post-Smoke
 * advance stamped, and the one canonical rest duration.
 *
 * The rest is the cook's, not this document's. The planner's stepper and the
 * field below are two views of the single value stored on the cook, which is
 * what keeps the plan and the record from ever disagreeing — the post-smoke
 * document goes on carrying its own `HH:MM` words for history's sake, written
 * from the same edit.
 */
interface CookRest {
  restMinutes: number | null;
  pullAt: Date | null;
  pullTemp: number | null;
}

/** A rest as the masked field writes it, in minutes. */
export const minutesOfRestTime = (restTime: string): number => {
  const [hours, minutes] = restTime.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

/** A rest in minutes, in the `HH:MM` the field is masked to. */
export const restTimeOf = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

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

  // The cook the session is on, read and written through the same load-on-mount
  // / save-on-leave seam as the document above: the rest the pitmaster sets
  // here is stored on the cook, where the planner reads it.
  const [cook, setCook] = useCurrentResource<CookRest>({
    initialValue: { restMinutes: null, pullAt: null, pullTemp: null },
    load: client =>
      client.smoke.getCurrent().then(smoke =>
        smoke
          ? {
              restMinutes: smoke.restMinutes ?? null,
              pullAt: smoke.pullAt ?? null,
              pullTemp: smoke.pullTemp ?? null,
            }
          : null
      ),
    // Only the rest: the pull is what the server observed, and writing it back
    // from a screen would let a remount move the moment the meat came off.
    save: (client, value) => client.smoke.saveServePlan({ restMinutes: value.restMinutes ?? 0 }),
    loadErrorMessage: 'Could not load the cook’s rest timer.',
    saveErrorMessage: 'Could not save the rest time.',
  });
  const { enabled, weightLb } = useRestConditions();

  // Whether the pitmaster has touched the rest field. Until they have, the
  // cook's stored rest is what it shows — that is the canonical value, and this
  // document's own `HH:MM` is only the words history keeps it in. Afterwards
  // nothing rewrites the field: what is being typed passes through a mask, and
  // a half-typed `02:3` re-rendered as `02:03` would fight the typist.
  const restEdited = React.useRef(false);
  const storedRest = cook.restMinutes;
  const typedRest = postSmokeState.restTime;
  React.useEffect(() => {
    // Both loads land in whichever order they land in, so this reconciles the
    // two whenever either arrives rather than assuming the cook came second.
    if (!restEdited.current && storedRest !== null && storedRest !== minutesOfRestTime(typedRest)) {
      setPostSmokeState(current => ({ ...current, restTime: restTimeOf(storedRest) }));
    }
  }, [storedRest, typedRest, setPostSmokeState]);

  /**
   * A rest the pitmaster set: written to the cook, where the planner reads it,
   * and to this document, whose `HH:MM` is what the history screens show.
   */
  const changeRestTime = (restTime: string): void => {
    // The mask hands back every value it is given, this step's own included:
    // setting the field from the store raises a change carrying exactly what
    // was set. Only a value that differs from what is on screen is somebody
    // typing, and only that counts as the rest having been edited.
    if (restTime === typedRest) {
      return;
    }
    restEdited.current = true;
    setPostSmokeState(current => ({ ...current, restTime }));
    setCook(current => ({ ...current, restMinutes: minutesOfRestTime(restTime) }));
  };

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
      {/* The rest, counting, above the field that says how long it runs for:
          the meat is already resting by the time this step opens, so the first
          thing on it is the clock rather than the form. Absent for a cook that
          was never pulled — there is nothing to count from — and absent
          entirely where the Serve Plan is switched off. */}
      {enabled && cook.pullAt !== null && (
        <RestTimerCard
          pullAt={cook.pullAt}
          pullTemp={cook.pullTemp}
          restMinutes={cook.restMinutes ?? minutesOfRestTime(postSmokeState.restTime)}
          weightLb={weightLb}
        />
      )}
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
          onChange={(event: any) => changeRestTime(event.target.value)}
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
