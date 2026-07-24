import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepButton from '@mui/material/StepButton';
import React from 'react';
import './smoke.style.css';
import { PreSmokeStep } from './preSmokeStep/preSmokeStep';
import { SmokeStep } from './smokeStep/smokeStep';
import { PostSmokeStep } from './postSmokeStep/PostSmokeStep';
import { Button, Grid } from '@mui/material';
import { useApiClient } from '../../api';

const steps = ['Pre-Smoke', 'Smoke', 'Post-Smoke'];

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
    <Grid container className="smoke">
      <Grid className="stepper">
        <Stepper nonLinear alternativeLabel activeStep={activeStep}>
          {steps.map((label, index) => (
            <Step key={label}>
              <StepButton
                color="inherit"
                data-testid={`smoke-step-${label}`}
                onClick={() => handleStep(index)}
              >
                {label}
              </StepButton>
            </Step>
          ))}
        </Stepper>
      </Grid>
      <Grid container className="stepScreen">
        {step}
      </Grid>
    </Grid>
  );
}
