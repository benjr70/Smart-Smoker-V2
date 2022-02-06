import Box from '@mui/material/Box';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepButton from '@mui/material/StepButton';
import React from 'react';
import './smoke.style.css'
import { PreSmokeStep } from './preSmokeStep';
import { SmokeStep } from './smokeStep';
import { PostSmokeStep } from './PostSmokeStep';

const steps = [
    'Pre-Smoke',
    'Smoke',
    'Post-Smoke',
  ];

export class Smoke extends React.Component<{},{activeStep: number}>{

    constructor(props: any){
        super(props);
        this.state = {activeStep: 0};
    }
    
     handleStep( step: any) {
        this.setState({activeStep: step})
      };

      render(): React.ReactNode { 
          let step;
          switch(this.state.activeStep){
                case 0:
                    step = <PreSmokeStep/>;
                    break;
                case 1:
                    step = <SmokeStep/>;
                    break;
                case 2:
                    step = <PostSmokeStep/>;
                    break;
          }
          return(
            <div className='smoke'>
            <Box className='stepper'>
                <Stepper nonLinear alternativeLabel activeStep={this.state.activeStep}>
                    {steps.map((label, index) => (
                        <Step key={label} >
                            <StepButton color="inherit" onClick={() => this.handleStep(index)}>
                            {label}
                            </StepButton>
                        </Step>
                    ))}
                </Stepper>
            </Box>
            {step}
            </div>
            )
    }
}