import React, { useState } from 'react'
import { SmokeCard } from './smokeCards/smokeCard';
import { Grid, TextField } from '@mui/material';
import './history.style.css';
import { getSmokeHistory } from '../../Services/smokerService';
import { smokeHistory } from '../common/interfaces/history';
import { SmokeReview } from './smokeReview/smokeReview';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import { IconButton } from '@mui/material';
import { deleteSmoke } from '../../Services/deleteSmokeService';

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
            const temp: historyInterface = {
                smokeHistoryList: result.reverse(),
                smokeId: undefined
            }
            this.setState({history: temp})
        }
        );
        this.onViewClick = this.onViewClick.bind(this);
        this.onBackClick = this.onBackClick.bind(this);
        this.onDeleteClick = this.onDeleteClick.bind(this);
    }

     onViewClick(smokeId: string) {
        const tempState = this.state.history;
        tempState.smokeId = smokeId;
        this.setState({history: tempState});
    }

    onBackClick(){
        const tempState = this.state.history;
        tempState.smokeId = undefined;
        this.setState({history: tempState});
    }

    async onDeleteClick(smokeId: string){
        await deleteSmoke(smokeId);
        await getSmokeHistory().then( (result:smokeHistory[]) => {
            const temp: historyInterface = {
                smokeHistoryList: result.reverse(),
                smokeId: undefined
            }
            this.setState({history: temp});
        });
    }

    render(): React.ReactNode{
        return (
        <Grid paddingTop={1}>
            {this.state.history.smokeId ?
            <Grid paddingLeft={2}>
                <IconButton color="primary"  component="label" onClick={this.onBackClick}>
                    <ArrowBackIosIcon/>
                </IconButton>
            </Grid>
            : <></>}
            <Grid container spacing={2} sx={{display: 'flex', justifyContent: 'center'}} paddingBottom={8}>
            {!this.state.history.smokeId ?
                this.state.history.smokeHistoryList.map(smokeHistory => {
                    return (<Grid item xs={11}>
                        <SmokeCard
                            name={smokeHistory.name}
                            meatType={smokeHistory.meatType}
                            date={smokeHistory.date}
                            weight={smokeHistory.weight}
                            overAllRatings={smokeHistory.overAllRating}
                            weightUnit={smokeHistory.weightUnit}
                            woodType={smokeHistory.woodType}
                            smokeId={smokeHistory.smokeId}
                            onViewClick={this.onViewClick}
                            onDeleteClick={this.onDeleteClick}
                        />
                    </Grid>)
                }) :
                <SmokeReview
                    smokeId={this.state.history.smokeId}
                />
            }
            </Grid>
        </Grid>);
    }
}