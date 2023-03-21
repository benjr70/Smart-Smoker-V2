import React from 'react'
import { SmokeCard } from './smokeCard/smokeCard';
import { Grid, TextField } from '@mui/material';
import './history.style.css';

export const history = () => {
    return (
    <Grid>
        {/* <Grid container spacing={2} sx={{display: 'flex', justifyContent: 'center'}}>
            <Grid item xs={11}>
                <TextField
                    label='Search'
                /> 
            </Grid>
        </Grid> */}
        <Grid container spacing={2} sx={{display: 'flex', justifyContent: 'center'}}>
            <Grid item xs={11}>
                <SmokeCard
                    name='Smoke Name'
                    meatType='Brisket'
                    date='03/20/2023'
                    weight='4'
                    weightUnit='LB'
                />
            </Grid>
            <Grid item xs={11}>
                <SmokeCard
                    name='Smoke Name'
                    meatType='Brisket'
                    date='03/20/2023'
                    weight='4'
                    weightUnit='LB'
                />
            </Grid>
        </Grid>
    </Grid>);
}