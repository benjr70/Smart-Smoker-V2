import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepButton from '@mui/material/StepButton';
import React from 'react';
import './smoke.style.css';
import { PreSmokeStep } from './preSmokeStep/preSmokeStep';
import { SmokeStep } from './smokeStep/smokeStep';
import { PostSmokeStep } from './postSmokeStep/PostSmokeStep';
import { Button, Grid } from '@mui/material';
import { FinishSmoke, clearSmoke } from '../../Services/smokerService';

const steps = ['Pre-Smoke', 'Smoke', 'Post-Smoke'];

export function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function Smoke(): JSX.Element {
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
      await FinishSmoke().then(() => clearSmoke());
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
    <Button className="nextButton" variant="contained" size="small" onClick={() => nextStep()}>
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
              <StepButton color="inherit" onClick={() => handleStep(index)}>
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
