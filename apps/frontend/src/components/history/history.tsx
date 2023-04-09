import React, { useState } from 'react'
import { SmokeCard } from './smokeCard/smokeCard';
import { Grid, TextField } from '@mui/material';
import './history.style.css';
import { getSmokeHistory } from '../../Services/smokerService';
import { smokeHistory } from '../common/interfaces/history';


export class History extends React.Component<{},{smokeHistoryList: smokeHistory[]}> {

    constructor(props: any){
        super(props);
        this.state = { smokeHistoryList: []}
        getSmokeHistory().then( (result:smokeHistory[]) => {
            result.pop()
            this.setState({smokeHistoryList: result.reverse()})
        });
    }

    render(): React.ReactNode{
        return (<Grid>
            {/* <Grid container spacing={2} sx={{display: 'flex', justifyContent: 'center'}}>
                <Grid item xs={11}>
                    <TextField
                        label='Search'
                    /> 
                </Grid>
            </Grid> */}

            <Grid container spacing={2} sx={{display: 'flex', justifyContent: 'center'}}>
            {this.state.smokeHistoryList.map(smokeHistory => {
                return (<Grid item xs={11}>
                    <SmokeCard
                        name={smokeHistory.name}
                        meatType={smokeHistory.meatType}
                        date={smokeHistory.date}
                        weight={smokeHistory.weight}
                        weightUnit={smokeHistory.weightUnit}
                        woodType={smokeHistory.woodType}
                        smokeId={smokeHistory.smokeId}
                    />
                </Grid>)
            })}
            </Grid>
        </Grid>);
    }
}