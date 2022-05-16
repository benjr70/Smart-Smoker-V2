import React from 'react';
import './home.style.css'
import Grid from '@mui/material/Grid';

export class Home extends React.Component<{}> {




    render(): React.ReactNode { 
        return (
        <Grid container className='background'>
            <Grid container direction="column" spacing={2}>
                <Grid item className='text' >
                   Meat Temp
                </Grid>
                <Grid item className='text'>
                    Chamber Temp
                </Grid>
            </Grid>
        </Grid>)
    }

}