import { Grid, TextField } from '@mui/material';
import React from 'react';
import { useCurrentResource } from '../../../api';
import { DynamicList } from '../../common/components/DynamicList';
import { FormField, SectionHeading } from '../../common/components/FormField';
import { IMaskInput } from 'react-imask';
import { PostSmoke } from '../../../api/types';
import {
  FilledFlash,
  ScreenBinding,
  VOICE_FILL_BUTTON_CLEARANCE,
  useScreenBinding,
  useVoiceFill,
} from '../../../voiceFill';
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
  /**
   * Whether a cook in progress was actually read. A step opened with no session
   * under way has no cook to write a rest onto, and `restMinutes: null` alone
   * cannot tell that apart from a cook nobody has set a rest for.
   */
  present: boolean;
  restMinutes: number | null;
  pullAt: Date | null;
  pullTemp: number | null;
}

/** A rest as the masked field writes it, in minutes. */
export const minutesOfRestTime = (restTime: string): number => {
  const [hours, minutes] = restTime.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

/**
 * The rest the field is carrying, or `null` where it carries none.
 *
 * An empty field is not a rest of no time — a cook nobody has planned a rest
 * for and a cook somebody deliberately gave none say different things — and
 * neither is the `02:3` a half-typed value passes through on its way.
 */
export const fieldRestMinutes = (restTime: string): number | null =>
  /^\d{2}:\d{2}$/.test(restTime) ? minutesOfRestTime(restTime) : null;

/** A rest in minutes, in the `HH:MM` the field is masked to. */
export const restTimeOf = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * The rest the card counts when nobody has said how long the meat rests: half
 * an hour, which is the shortest rest worth calling one on the cuts this app is
 * used for.
 *
 * Counted rather than assumed onto the cook — nothing is stored from it. It is
 * only what the card shows in place of a countdown that would otherwise start
 * finished, telling the pitmaster to carve the moment the meat came off.
 */
export const DEFAULT_REST_MINUTES = 30;

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
    initialValue: { present: false, restMinutes: null, pullAt: null, pullTemp: null },
    load: client =>
      client.smoke.getCurrent().then(smoke =>
        smoke
          ? {
              present: true,
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
  const recordRest = fieldRestMinutes(postSmokeState.restTime);
  // The cook's rest shown *through* the field rather than written into the
  // document behind it: a step that was opened and left again must save
  // nothing, and a document state nudged by a display decision is an edit the
  // pitmaster never made (see `useCurrentResource`'s untouched-form guard).
  const shownRest =
    !restEdited.current && storedRest !== null ? restTimeOf(storedRest) : postSmokeState.restTime;

  const cookPresent = cook.present;
  React.useEffect(() => {
    // The other direction of the same one value: a record carrying a rest the
    // cook does not have — written before the planner existed, or on a device
    // that never opened it — makes that rest the canonical one, so the planner
    // and the record cannot sit disagreeing until somebody retypes the field.
    // Both loads land in whichever order they land in, so this reconciles them
    // whenever either arrives rather than assuming the cook came second.
    if (!restEdited.current && cookPresent && storedRest === null && recordRest !== null) {
      setCook(current =>
        current.restMinutes === null ? { ...current, restMinutes: recordRest } : current
      );
    }
  }, [cookPresent, storedRest, recordRest, setCook]);

  // The screen as the cook sees it, as of the latest render: what a caller
  // that outlives a render — Voice Fill's binding, and the undo of a rest
  // already written — reads the rest on screen from.
  const shown = React.useRef(shownRest);
  shown.current = shownRest;

  /**
   * A rest the pitmaster set, typed or spoken: written to the cook, where the
   * planner reads it, and to this document, whose `HH:MM` is what the history
   * screens show. The one way a rest is written from this step.
   *
   * What it returns takes that rest back — the cook's duration, the document's
   * words and whether the field counts as edited, all as they were — for as
   * long as the rest it wrote is still the one on screen.
   */
  const changeRestTime = (restTime: string): (() => void) => {
    // The mask hands back every value it is given, this step's own included:
    // setting the field from the store raises a change carrying exactly what
    // was set. Only a value that differs from what is on screen is somebody
    // setting the rest, and only that counts as the rest having been edited.
    if (restTime === shownRest) {
      return () => undefined;
    }
    const before = {
      edited: restEdited.current,
      restTime: postSmokeState.restTime,
      restMinutes: cook.restMinutes,
    };
    restEdited.current = true;
    setPostSmokeState(current => ({ ...current, restTime }));
    setCook(current => ({ ...current, restMinutes: minutesOfRestTime(restTime) }));
    return () => {
      // A rest changed again since holds nothing of this write any more, and
      // putting back what came before it would overwrite the newer value.
      if (shown.current !== restTime) {
        return;
      }
      restEdited.current = before.edited;
      setPostSmokeState(current => ({ ...current, restTime: before.restTime }));
      setCook(current => ({ ...current, restMinutes: before.restMinutes }));
    };
  };
  const setRest = React.useRef(changeRestTime);
  setRest.current = changeRestTime;

  // What Voice Fill reads and writes this screen through. The steps and Notes
  // are the document's, written through the setter typing goes through; the
  // rest is the cook's, so it is read as the field shows it and written the
  // way the field writes it — a spoken rest reaches the planner exactly as a
  // typed one does, and its undo takes it back from the planner too.
  const record = useScreenBinding(postSmokeState, setPostSmokeState);
  const binding = React.useMemo<ScreenBinding<PostSmoke>>(
    () => ({
      values: () => ({ ...record.values(), restTime: shown.current }),
      apply: ({ restTime, ...stepsAndNotes }) => {
        const undoRest = restTime === undefined ? undefined : setRest.current(restTime);
        const undoRecord = record.apply(stepsAndNotes);
        return () => {
          undoRecord();
          undoRest?.();
        };
      },
    }),
    [record]
  );
  const voiceFill = useVoiceFill('postSmoke', binding);

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
          // The cook's rest, the record's own words for one where the cook has
          // none yet, and a sensible half hour where neither has said: a
          // countdown of no minutes at all would read "Ready to slice" the
          // instant the meat came off.
          restMinutes={storedRest ?? recordRest ?? DEFAULT_REST_MINUTES}
          weightLb={weightLb}
        />
      )}
      {/* The format lives in the label, as the design writes it: the mask
          rewrites what is typed, and a field that says how it is written before
          it is typed into is not correcting anybody afterwards. */}
      <FilledFlash field="restTime" flashing={voiceFill.isFlashing('restTime')}>
        <FormField label="Rest Time (HH:MM)" htmlFor="postsmoke-rest-time">
          <TextField
            id="postsmoke-rest-time"
            fullWidth
            size="small"
            value={shownRest}
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
      </FilledFlash>
      {/* The wrap-up plan and its heading are one field of the form, spaced the
          way a label sits above its control. */}
      <FilledFlash
        field="steps"
        flashing={voiceFill.isFlashing('steps')}
        sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
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
      </FilledFlash>
      <FilledFlash field="notes" flashing={voiceFill.isFlashing('notes')}>
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
      </FilledFlash>
      {/* The step's one action, at the foot of it and against the right-hand
          edge, which is where the design ends every step. The Voice fill
          button is pinned over that same corner, so where it is offered the
          step ends with room for it underneath: scrolled to its foot, the
          action is clear of the button. */}
      <Grid
        container
        flexDirection="row-reverse"
        sx={{
          paddingBottom: voiceFill.offered ? `${VOICE_FILL_BUTTON_CLEARANCE + 8}px` : '8px',
        }}
      >
        {nextButton}
      </Grid>
      {voiceFill.controls}
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
