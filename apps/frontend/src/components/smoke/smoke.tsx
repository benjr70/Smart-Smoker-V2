import React from 'react';
import './smoke.style.css';
import { PreSmokeStep } from './preSmokeStep/preSmokeStep';
import { SmokeStep } from './smokeStep/smokeStep';
import { PostSmokeStep } from './postSmokeStep/PostSmokeStep';
import { Button, Grid } from '@mui/material';
import { useApiClient, useApiSnackbar } from '../../api';
import { SegmentedControl, segmentTabId } from '../common/components/SegmentedControl';
import { SmokeComplete } from './SmokeComplete';
import { SmokeHeader } from './SmokeHeader';

/**
 * The three steps of the wizard, in the order the control offers them. The
 * value doubles as the segment's label and as the suffix of its test id, which
 * is what keeps `smoke-step-Pre-Smoke` addressing the same thing it always did.
 */
const steps = [
  { value: 'Pre-Smoke', label: 'Pre-Smoke' },
  { value: 'Smoke', label: 'Smoke' },
  { value: 'Post-Smoke', label: 'Post-Smoke' },
] as const;

type StepValue = (typeof steps)[number]['value'];

/**
 * The id of the region the step control switches: the step being edited. The
 * control points its segments at it and the region names itself after the
 * segment in effect, so the two are one relationship rather than a row of tabs
 * leading nowhere.
 */
const STEP_PANEL_ID = 'smoke-step-panel';

export function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface SmokeProps {
  /**
   * Where "View History" on the completion screen goes. The wizard does not
   * know how this application navigates — that is the shell's business — so it
   * asks rather than routes.
   */
  onViewHistory?: () => void;
  /**
   * Where the smoke step's completion card sends a cook who is watching no
   * probe. Asked for the same reason as the history: the wizard does not know
   * how this application navigates.
   */
  onOpenSettings?: () => void;
}

export function Smoke({ onViewHistory, onOpenSettings }: SmokeProps = {}): JSX.Element {
  const client = useApiClient();
  const notify = useApiSnackbar();
  const [activeStep, setActiveStep] = React.useState(0);
  // Whether the cook this wizard was editing has been archived. It is the end
  // of the wizard's *body* rather than a fourth step: what it was editing no
  // longer exists once the session is cleared, so the steps have nothing to
  // show — but the header and its step control stay, because tapping a step is
  // how the next cook is started.
  const [complete, setComplete] = React.useState(false);

  /**
   * The meat coming off the smoker, recorded where it happened: reaching
   * Post-Smoke *from* Smoke is the pull, however the pitmaster got there — the
   * step's own Next, or the header's step control, which is a supported way
   * across and not a shortcut around the wizard.
   *
   * Swallowed and logged like the finish flow's calls: what is stamped is the
   * backend's business, and a stamp that did not land must not keep the
   * pitmaster on a step they have finished with. The stamp is written once
   * server-side, so an advance made twice — or by two devices — does not
   * restart a rest already under way.
   */
  const stampPull = async (): Promise<void> => {
    await client.smoke.stampPull().catch(error => {
      console.log(error);
      return null;
    });
  };

  const handleStep = (step: any) => {
    // Coming back to a step from the completion screen starts the next cook:
    // the wizard is mounted for as long as the Smoke tab is the screen in
    // effect, so nothing else would ever take the completion screen down.
    setComplete(false);
    // Stepping out of Smoke into Post-Smoke is the meat coming off, exactly as
    // the step's own Next is; stepping back to Pre-Smoke leaves it on the
    // smoker. The stamp lands before the step opens — as it does on the Next
    // path — because the Post-Smoke step reads the pull once, when it mounts.
    if (activeStep === 1 && step === 2) {
      void stampPull().then(() => setActiveStep(step));
      return;
    }
    setActiveStep(step);
  };

  const nextStep = async () => {
    let nextStep = activeStep;
    if (activeStep === 2) {
      // Parking on an index past the last step unmounts the step being left,
      // which is what persists what was typed into it; the beat after gives
      // that save the chance to land before the smoke is archived.
      setActiveStep(5);
      await delay(2);
      // Finalize the current smoke, then reset the session (the websocket
      // `clear` broadcast fires inside the client's clearSmoke). Both calls
      // swallow-and-log, as the two legacy shims did before this cutover, so a
      // backend that is down cannot take the wizard with it — but what they
      // return decides what the user is then told. Saying "saved to history"
      // over a failed archive is worse than the crash: it is a cook the
      // pitmaster stops looking for.
      const archived = await client.smoke
        .finish()
        .then(() => true)
        .catch(error => {
          console.log(error);
          return false;
        });
      const cleared = archived
        ? await client.state
            .clearSmoke()
            .then(() => true)
            .catch(error => {
              console.log(error);
              return false;
            })
        : // The session is not cleared over a failed archive: clearing is what
          // makes the cook unreachable, and a cook that was never archived is
          // then gone for good.
          false;

      if (archived && cleared) {
        setComplete(true);
        return;
      }
      // Back to the step the user pressed Finish on, which is where pressing it
      // again is offered. Nothing claims the session was saved, because it was
      // not — or was saved but not closed, which is its own thing to say.
      setActiveStep(2);
      notify(
        archived
          ? 'The smoke was saved to history, but the session could not be closed. Try finishing again.'
          : 'Could not finish the smoke — it has not been saved to history. Try again.'
      );
      return;
    }
    nextStep++;
    if (nextStep < 3) {
      // Leaving the Smoke step is the meat coming off, so it is what stamps the
      // pull the rest is counted from — the pitmaster makes no second gesture
      // and fills in no time. Swallowed and logged like the finish flow's
      // calls: what is stamped is the backend's business, and a stamp that did
      // not land must not keep the pitmaster on a step they have finished with.
      // The stamp is written once server-side, so an advance made twice — or by
      // two devices — does not restart a rest already under way.
      if (activeStep === 1) {
        await stampPull();
      }
      setActiveStep(nextStep);
    }
  };

  // The finish flow parks the wizard on a step index past the last one while it
  // resets; the control still has to name a segment, and the step being left is
  // the honest one to name.
  const shownStep = steps[Math.min(activeStep, steps.length - 1)].value;

  let step;
  // One action at the foot of each step, against the right-hand edge: the row
  // it sits in is reversed by each step (see their containers).
  const nextButton = (
    <Button
      className="nextButton"
      variant="contained"
      size="small"
      data-testid="smoke-next-button"
      onClick={() => nextStep()}
    >
      {activeStep === 2 ? 'Finish' : 'Next'}
    </Button>
  );

  if (complete) {
    // The end of the cook, in the place the steps were: the header and the step
    // control stay on screen, so the way on from here is the way the design
    // offers — the history, or a step, which begins the next cook.
    step = <SmokeComplete onViewHistory={() => onViewHistory?.()} />;
  } else {
    switch (activeStep) {
      case 0:
        step = <PreSmokeStep nextButton={nextButton} />;
        break;
      case 1:
        step = <SmokeStep nextButton={nextButton} onOpenSettings={onOpenSettings} />;
        break;
      case 2:
        step = <PostSmokeStep nextButton={nextButton} />;
        break;
    }
  }

  return (
    // The wizard stacks the header above the step and shares one viewport
    // between them (see `.smoke` in smoke.style.css). Both the direction and
    // `nowrap` are set here rather than in the stylesheet: Material-UI emits
    // `flex-direction` and `flex-wrap` for every Grid container, so a
    // stylesheet setting them is left to whichever rule the browser saw last —
    // and a wrapping column turns a step too tall for the screen into a second
    // column beside the first.
    <Grid container direction="column" wrap="nowrap" className="smoke" data-testid="smoke-screen">
      <SmokeHeader>
        <SegmentedControl
          options={steps}
          value={shownStep}
          onChange={(value: StepValue) => handleStep(steps.findIndex(step => step.value === value))}
          label="Smoke step"
          panelId={STEP_PANEL_ID}
          testIdPrefix="smoke-step"
        />
      </SmokeHeader>
      <Grid
        container
        className="stepScreen"
        role="tabpanel"
        id={STEP_PANEL_ID}
        aria-labelledby={segmentTabId(STEP_PANEL_ID, shownStep)}
      >
        {step}
      </Grid>
    </Grid>
  );
}
