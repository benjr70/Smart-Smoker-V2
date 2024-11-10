import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepButton from '@mui/material/StepButton';
import React from 'react';
import './smoke.style.css'
import { PreSmokeStep } from './preSmokeStep/preSmokeStep';
import { SmokeStep } from './smokeStep/smokeStep';
import { PostSmokeStep } from './postSmokeStep/PostSmokeStep';
import { Box, Button, Grid } from '@mui/material';
import { FinishSmoke, clearSmoke } from '../../Services/smokerService';
import { RateSmokeStep } from './RateSmokeStep/rateSmokeStep';

const steps = [
    'Pre-Smoke',
    'Smoke',
    'Post-Smoke',
    // 'Rate',
  ];
  
export function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}
 
export class Smoke extends React.Component<{},{activeStep: number}>{

    constructor(props: any){
        super(props);
        this.state = {activeStep: 0};
    }
    
     handleStep( step: any) {
        this.setState({activeStep: step})
      };

      async nextStep(){
        let nextStep = this.state.activeStep
        if(this.state.activeStep === 2){
            nextStep = 0;
            this.setState({activeStep: 5});
            await delay(2);
            await FinishSmoke().then(() => clearSmoke());
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
          const nextButton = (
            <Button
                className="nextButton"
                variant="contained"
                size="small"
                onClick={() => this.nextStep()}
            >
                {this.state.activeStep === 2 ? 'Finish' : "Next"}
            </Button>
        );
          switch(this.state.activeStep){
                case 0:
                    step = <PreSmokeStep nextButton={nextButton}/>;
                    break;
                case 1:
                    step = <SmokeStep nextButton={nextButton}/>;
                    break;
                case 2:
                    step = <PostSmokeStep nextButton={nextButton}/>;
                    break;
                // case 3:
                //     step = <RateSmokeStep nextButton={nextButton}/>;
                //     break;
          }

          return(
            <Grid container className='smoke'>
                <Grid className='stepper'>
                    <Stepper nonLinear alternativeLabel activeStep={this.state.activeStep}>
                        {steps.map((label, index) => (
                            <Step key={label} >
                                <StepButton color="inherit" onClick={() => this.handleStep(index)}>
                                {label}
                                </StepButton>
                            </Step>
                        ))}
                    </Stepper>
                </Grid>
                <Grid container className='stepScreen'>
                    {step} 
                </Grid> 
            </Grid>
            )
    }
}