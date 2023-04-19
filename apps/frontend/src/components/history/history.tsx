import React, { useState } from 'react'
import { SmokeCard } from './smokeCard/smokeCard';
import { Grid, TextField } from '@mui/material';
import './history.style.css';
import { getSmokeHistory } from '../../Services/smokerService';
import { smokeHistory } from '../common/interfaces/history';


interface historyInterface {
    smokeHistoryList: smokeHistory[],
    smokeId?: string
}

export class History extends React.Component<{},{history: historyInterface}> {

    constructor(props: any){
        super(props);
        this.state = { history: {
            smokeHistoryList: [],
            smokeId: undefined
            }
        }
        getSmokeHistory().then( (result:smokeHistory[]) => {
            result.pop()
            const temp: historyInterface = {
                smokeHistoryList: result.reverse(),
                smokeId: undefined
            }
            this.setState({history: temp})
        }
        );
        this.onViewClick = this.onViewClick.bind(this);
    }

     onViewClick(smokeId: string) {
        console.log('clickies', smokeId)
        const test: historyInterface = {
            smokeHistoryList: [],
            smokeId: smokeId
        }
        this.setState({history: test});
    }

    render(): React.ReactNode{
        return (
        <Grid>
            <Grid container spacing={2} sx={{display: 'flex', justifyContent: 'center'}}>

            {!this.state.history.smokeId ?
                this.state.history.smokeHistoryList.map(smokeHistory => {
                    return (<Grid item xs={11}>
                        <SmokeCard
                            name={smokeHistory.name}
                            meatType={smokeHistory.meatType}
                            date={smokeHistory.date}
                            weight={smokeHistory.weight}
                            weightUnit={smokeHistory.weightUnit}
                            woodType={smokeHistory.woodType}
                            smokeId={smokeHistory.smokeId}
                            onViewClick={this.onViewClick}
                        />
                    </Grid>)
                }) :
                <Grid>
                {this.state.history.smokeId}
                </Grid>
            }
        
            </Grid>
        </Grid>);
    }
}