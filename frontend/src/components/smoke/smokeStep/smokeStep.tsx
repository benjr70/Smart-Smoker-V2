import React from "react";
import Grid from '@mui/material/Grid';
import './smokeStep.style.css'
import { io } from 'socket.io-client';
import { Autocomplete, Button, TextField } from "@mui/material";
import { getState, toggleSmoking } from "../../../Services/smokerService";

interface State {
    meatTemp: string;
    chamberTemp: string;
    smoking: boolean;
    notes: string;
    woodType: string;
}

const woodType = [
    'Hickory',
    'Post Oak',
    'Pecan',
    'Cheery',
    'Apple',
];

export class SmokeStep extends React.Component<{}, {tempState: State}> {

    constructor(props: any) {
        super(props);
        this.state = { tempState: {
            meatTemp: '0',
            chamberTemp: '0',
            smoking: false,
            notes: '',
            woodType: ''
            }
        };
        this.updateNotes = this.updateNotes.bind(this);
        this.updateWoodType = this.updateWoodType.bind(this);
    }

    componentDidMount(): void {
        // const socket = io('http://136.60.164.223:3001');
        const socket = io('http://localhost:3001');
        console.log(socket);
        socket.on('events', ((message) => {
            let tempObj = JSON.parse(message);
            let temp = this.state.tempState;
            temp.chamberTemp = tempObj.chamberTemp;
            temp.meatTemp = tempObj.meatTemp;
            this.setState({tempState: temp})
        }))

        getState().then(state => {
            let temp = this.state.tempState;
            temp.smoking = state.smoking
            this.setState({tempState: temp});
        })
    }

    startSmoke(): void {
        toggleSmoking().then(state => {
            let temp = this.state.tempState;
            temp.smoking = state.smoking
            this.setState({tempState: temp});
        })
    }

    updateNotes(event: any){
        let temp = this.state.tempState;
        temp.notes = event.target.value;
        this.setState({tempState: temp});
    }

    updateWoodType(newInputValue: string){
        let temp = this.state.tempState;
        temp.woodType = newInputValue;
        this.setState({tempState: temp});
    }


    render(): React.ReactNode {
        return (
            <Grid container>
                <Grid container direction="column" >
                    <Grid container direction="row" justifyContent='space-around' spacing={3}>
                        <Grid item xs={9} className='text' >
                            Meat Temp
                        </Grid>
                        <Grid item className='text' >
                            {this.state.tempState.meatTemp}
                        </Grid>
                    </Grid>
                    <Grid container direction="row" justifyContent='space-around' spacing={3}>
                        <Grid item xs={9} className='text' >
                            Chamber Temp
                        </Grid>
                        <Grid item className='text' >
                            {this.state.tempState.chamberTemp}
                        </Grid>
                    </Grid>
                </Grid>
                <Grid container  direction="column">
                    <Autocomplete
                        sx={{marginBottom: '10px'}}
                        freeSolo
                        options={woodType.map((option) => option)}
                        inputValue={this.state.tempState.woodType}
                        onInputChange={(event, newInputValue) => {this.updateWoodType(newInputValue)}}
                        renderInput={(params) => 
                        <Grid container direction="row" justifyContent='space-around' >
                            <TextField 
                                sx={{
                                    marginTop: '10px',
                                    marginBottom: '10px',
                                    width: '350px'
                                    }}
                                {...params}label="Wood Type"  />
                            </Grid>}
                    />
                    <Grid container direction="row" justifyContent='space-around'>
                        <TextField
                            sx={{
                                marginTop: '10px',
                                marginBottom: '10px',
                                width: '350px'
                            }}
                            id="outlined-multiline-static"
                            label="Notes"
                            multiline
                            value={this.state.tempState.notes}
                            onChange={this.updateNotes}
                            rows={4}
                        />
                    </Grid>
                </Grid>
                <Grid container className="buttonContainer" flexDirection='row-reverse'>
                    <Button
                    className="button"
                    variant="contained"
                    size="small"
                    onClick={() => this.startSmoke()}
                    >{this.state.tempState.smoking ? 'Stop Smoking' : 'Start Smoking'}
                    </Button>
                </Grid>
            </Grid>
        );
    }
}