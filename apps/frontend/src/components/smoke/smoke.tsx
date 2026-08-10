import React from 'react';
import './smoke.style.css';
import { PreSmokeStep } from './preSmokeStep/preSmokeStep';
import { SmokeStep } from './smokeStep/smokeStep';
import { PostSmokeStep } from './postSmokeStep/PostSmokeStep';
import { Button, Grid } from '@mui/material';
import { useApiClient } from '../../api';
import { SegmentedControl, segmentTabId } from '../common/components/SegmentedControl';
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

export function Smoke(): JSX.Element {
  const client = useApiClient();
  const [activeStep, setActiveStep] = React.useState(0);

  const handleStep = (step: any) => {
    setActiveStep(step);
  };

  const nextStep = async () => {
    let nextStep = activeStep;
    if (activeStep === 2) {
      nextStep = 0;
      setActiveStep(5);
      await delay(2);
      // Finalize the current smoke, then reset the session (the websocket
      // `clear` broadcast fires inside the client's clearSmoke). Each call
      // swallows-and-logs so a backend failure still resets the stepper — the
      // behavior the two legacy shims preserved before this cutover.
      await client.smoke.finish().catch(error => console.log(error));
      await client.state.clearSmoke().catch(error => console.log(error));
      setActiveStep(nextStep);
      return;
    }
    nextStep++;
    if (nextStep < 3) {
      setActiveStep(nextStep);
    }
  };

  // The finish flow parks the wizard on a step index past the last one while it
  // resets; the control still has to name a segment, and the step being left is
  // the honest one to name.
  const shownStep = steps[Math.min(activeStep, steps.length - 1)].value;

  let step;
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

  switch (activeStep) {
    case 0:
      step = <PreSmokeStep nextButton={nextButton} />;
      break;
    case 1:
      step = <SmokeStep nextButton={nextButton} />;
      break;
    case 2:
      step = <PostSmokeStep nextButton={nextButton} />;
      break;
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
