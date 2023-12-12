import { Grid } from '@mui/material';
import React from 'react'

declare const VERSION: string; 

export const settings = () => {
    let versionToDisplay = "unknown";
    try {
      versionToDisplay = VERSION;
    } catch (error) {
      console.log("Cannot get version of application.");
    }
    return (
        <Grid item className='text' sx={{margin: '5px'}} >
            {`Version: ${versionToDisplay}`}
        </Grid>
    );
}