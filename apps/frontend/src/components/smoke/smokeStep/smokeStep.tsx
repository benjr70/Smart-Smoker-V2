import React from "react";
import Grid from '@mui/material/Grid';
import './smokeStep.style.css'
import { io } from 'socket.io-client';
import { Autocomplete, Button, Divider, Input, TextField } from "@mui/material";
import { getCurrentSmokeProfile, getState, setSmokeProfile, smokeProfile, toggleSmoking } from "../../../Services/smokerService";
import { getCurrentTemps } from "../../../Services/tempsService";
import  TempChart, { TempData } from 'temperaturechart/src/tempChart';


interface State {
    probeTemp1: string;
    probeTemp2: string;
    probeTemp3: string;
    chamberTemp: string;
    smoking: boolean;
    notes: string;
    woodType: string;
    date: Date;
}

const woodType = [
    'Hickory',
    'Post Oak',
    'Pecan',
    'Cheery',
    'Apple',
];

type SmokeStepProps = {
    nextButton: JSX.Element;
};

const ariaLabel = { 'aria-label': 'description' };
let initTemps: TempData[] = [];
let socket: any;
export class SmokeStep extends React.Component<SmokeStepProps, {tempState: State}> {

    constructor(props: any) {
        super(props);
        this.state = { tempState: {
            probeTemp1: '0',
            probeTemp2: '0',
            probeTemp3: '0',
            chamberTemp: '0',
            smoking: false,
            notes: '',
            woodType: '',
            date: new Date()
            }
        };

        this.updateNotes = this.updateNotes.bind(this);
        this.updateWoodType = this.updateWoodType.bind(this);
    }

    async componentDidMount(): Promise<void> {
        getCurrentSmokeProfile().then((smokeProfile: smokeProfile) => {
            let temp = this.state.tempState;
            temp.notes = smokeProfile.notes;
            temp.woodType = smokeProfile.woodType;
            this.setState({tempState: temp});
        })
        initTemps = await getCurrentTemps();
        let url = process.env.WS_URL ?? '';
        socket = io(url);
        console.log(socket);
        socket.on('events', ((message) => {
            let tempObj = JSON.parse(message);
            let temp = this.state.tempState;
            temp.chamberTemp = tempObj.chamberTemp;
            temp.probeTemp1 = tempObj.probeTemp1;
            temp.probeTemp2 = tempObj.probeTemp2;
            temp.probeTemp3 = tempObj.probeTemp3;
            temp.date = tempObj.date;
            this.setState({tempState: temp})
        }))
        socket.on('smokeUpdate', ((message) => {
            let temp = this.state.tempState;
            temp.smoking = message;
            this.setState({tempState: temp});
        }))

        socket.on('refresh', async () => {
            initTemps = await getCurrentTemps();
        })

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
            socket.emit('smokeUpdate', state.smoking);
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

    componentWillUnmount(){
        const smokeProfileDto: smokeProfile = {
            notes: this.state.tempState.notes,
            woodType: this.state.tempState.woodType,
        }
        setSmokeProfile(smokeProfileDto);
    }


    render(): React.ReactNode {
        return (
            <Grid item xs={12}>
                <Grid container direction="column" sx={{marginTop: '10px'}}>
                    <Grid container direction="row" justifyContent='space-around' sx={{margin: '5px'}} color={'#1f4f2d'}>
                        <Input 
                            defaultValue="Chamber"
                            sx={{
                                fontSize: 24,
                                fontWeight: 700,
                                color: '#1f4f2d',
                                width: '75%',
                            }}
                            disableUnderline={true}
                          />
                        <Grid item className='text' >
                            {this.state.tempState.chamberTemp}
                        </Grid>
                    </Grid>
                    <Divider variant="middle"/>
                    <Grid container direction="row" justifyContent='space-around' sx={{margin: '5px'}} color={'#2a475e'}>
                        <Input 
                            defaultValue="Probe 1"
                            sx={{
                                fontSize: 24,
                                fontWeight: 700,
                                color: '#2a475e',
                                width: '75%',
                            }}
                            disableUnderline={true}
                          />
                        <Grid item className='text' >
                            {this.state.tempState.probeTemp1}
                        </Grid>
                    </Grid>
                    <Divider variant="middle"/>
                    <Grid container direction="row" justifyContent='space-around' sx={{margin: '5px'}} color={'#118cd8'}>
                        <Input 
                            defaultValue="Probe 2"
                            sx={{
                                fontSize: 24,
                                fontWeight: 700,
                                color: '#118cd8',
                                width: '75%',
                            }}
                            disableUnderline={true}
                          />
                        <Grid item className='text' >
                            {this.state.tempState.probeTemp2}
                        </Grid>
                    </Grid>
                    <Divider variant="middle"/>
                    <Grid container direction="row" justifyContent='space-around' sx={{margin: '5px'}} color={'#5582a7'}>
                        <Input 
                            defaultValue="Probe 3"
                            sx={{
                                fontSize: 24,
                                fontWeight: 700,
                                color: '#5582a7',
                                width: '75%',
                            }}
                            disableUnderline={true}
                          />
                        <Grid item className='text' >
                            {this.state.tempState.probeTemp3}
                        </Grid>
                    </Grid>
                    
                </Grid>
                <Grid item justifyContent='center'>
                    <TempChart
                        ChamberTemp={parseFloat(this.state.tempState.chamberTemp)}
                        MeatTemp={parseFloat(this.state.tempState.probeTemp1)}
                        Meat2Temp={parseFloat(this.state.tempState.probeTemp2)}
                        Meat3Temp={parseFloat(this.state.tempState.probeTemp3)}
                        date={this.state.tempState.date}
                        smoking={this.state.tempState.smoking}
                        initData={initTemps}></TempChart>
                </Grid>
                <Grid container className="buttonContainer" justifyContent='space-around'>
                    <Button
                    className="button"
                    variant="contained"
                    size="small"
                    onClick={() => this.startSmoke()}
                    >{this.state.tempState.smoking ? 'Stop Smoking' : 'Start Smoking'}
                    </Button>
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
                                    width: '95%'
                                    }}
                                {...params}label="Wood Type"  />
                            </Grid>}
                    />
                    <Grid container direction="row" justifyContent='space-around'>
                        <TextField
                            sx={{
                                marginTop: '10px',
                                marginBottom: '10px',
                                width: '95%'
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
                    {this.props.nextButton}
                </Grid>
            </Grid>
        );
    }
}