import Box from '@mui/material/Box';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepButton from '@mui/material/StepButton';
import React from 'react';
import './smoke.style.css'
import { PreSmokeStep } from './preSmokeStep/preSmokeStep';
import { SmokeStep } from './smokeStep/smokeStep';
import { PostSmokeStep } from './postSmokeStep/PostSmokeStep';
import { Button } from '@mui/material';
import { clearSmoke } from '../../Services/smokerService';

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

      nextStep(){
        let nextStep = this.state.activeStep
        if(this.state.activeStep === 2){
            clearSmoke();
            nextStep = 0;
            this.setState({activeStep: nextStep});
            return;
        }
        nextStep++;
         if(nextStep < 3){
            this.setState({activeStep: nextStep});
         }
      }

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
            <Button
                className="nextButton"
                variant="contained"
                size="small"
                onClick={() => this.nextStep()}
                >{this.state.activeStep === 2 ? 'Finish' : "Next"}
            </Button>
            </div>
            )
    }
}