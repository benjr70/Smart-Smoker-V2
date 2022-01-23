import Box from '@mui/material/Box';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepButton from '@mui/material/StepButton';
import React from 'react';
import './smoke.style.css'

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
        console.log('step', steps)
        this.setState({activeStep: step})
      };

      render(): React.ReactNode { 
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
            </div>
    )
    }
}