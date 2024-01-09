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
      <Grid container sx={{display: 'flex', justifyContent: 'center' ,  minHeight: 'calc(100vh - 56px)'}} >

        <Grid item xs={11}  >
            {`Version: ${versionToDisplay}`}
        </Grid>
      </Grid>
    );
}