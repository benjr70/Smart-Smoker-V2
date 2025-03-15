import React, { useEffect, useRef } from "react";
import Grid from '@mui/material/Grid';
import './smokeStep.style.css'
import { io } from 'socket.io-client';
import { Autocomplete, Button, Divider, Input, TextField } from "@mui/material";
import { getCurrentSmokeProfile, getState, setSmokeProfile, smokeProfile, toggleSmoking } from "../../../Services/smokerService";
import { getCurrentTemps } from "../../../Services/tempsService";
import  TempChart, { TempData } from 'temperaturechart/src/tempChart';
import { Socket } from 'socket.io-client';

interface State {
    chamberName: string;
    probe1Name: string;
    probe2Name: string;
    probe3Name: string;
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
    'Cherry',
    'Apple',
];

type SmokeStepProps = {
    nextButton: JSX.Element;
};

let socket: Socket;
let initTemps: TempData[] = [];

export function SmokeStep (props: SmokeStepProps) {

    const [tempState, setTempState] = React.useState<State>({
        chamberName: 'Chamber',
        probe1Name: 'probe 1',
        probe2Name: 'probe 2',
        probe3Name: 'probe 3',
        probeTemp1: '0',
        probeTemp2: '0',
        probeTemp3: '0',
        chamberTemp: '0',
        smoking: false,
        notes: '',
        woodType: '',
        date: new Date()
    });

    const tempStateRef = useRef(tempState);
    tempStateRef.current = tempState;

    useEffect(() => {    
        getCurrentSmokeProfile().then((smokeProfile: smokeProfile) => {
            setTempState((prevState) =>({
                ...prevState,
                chamberName: smokeProfile.chamberName,
                probe1Name: smokeProfile.probe1Name,
                probe2Name: smokeProfile.probe2Name,
                probe3Name: smokeProfile.probe3Name,
                notes: smokeProfile.notes,
                woodType: smokeProfile.woodType
            }));
        })
        getCurrentTemps().then((temps: TempData[]) => {
            initTemps = temps;
          });
        let url = process.env.WS_URL ?? '';
        socket = io(url);
        socket.on('events', ((message) => {
            let tempObj = JSON.parse(message);
            setTempState((prevState) => ({
                ...prevState,
                chamberTemp: tempObj.chamberTemp,
                probeTemp1: tempObj.probeTemp1,
                probeTemp2: tempObj.probeTemp2,
                probeTemp3: tempObj.probeTemp3,
                date: tempObj.date
            }));
        }))
        socket.on('smokeUpdate', ((message) => {
            setTempState((prevState) =>({...prevState, smoking: message.smoking}));
        }))
        socket.on('refresh', async () => {
            initTemps = await getCurrentTemps();
        })
        getState().then(state => {
            setTempState((prevState) =>({...prevState, smoking: state.smoking}));
        })    
        return () => {
            const smokeProfileDto: smokeProfile = {
                chamberName: tempStateRef.current.chamberName,
                probe1Name: tempStateRef.current.probe1Name,
                probe2Name: tempStateRef.current.probe2Name,
                probe3Name: tempStateRef.current.probe3Name,
                notes: tempStateRef.current.notes,
                woodType: tempStateRef.current.woodType,
            }
            setSmokeProfile(smokeProfileDto);
        }
    }, []);

    const startSmoke = (): void => {
        toggleSmoking().then(state => {
            let temp = tempState;
            temp.smoking = state.smoking
            let update = {
                smoking: state.smoking,
                chamberName: temp.chamberName,
                probe1Name: temp.probe1Name,
                probe2Name: temp.probe2Name,
                probe3Name: temp.probe3Name,
            }
            socket.emit('smokeUpdate', update);
            setTempState((prevState) => ({
                ...prevState,
                smoking: state.smoking,
                chamberName: temp.chamberName,
                probe1Name: temp.probe1Name,
                probe2Name: temp.probe2Name,
                probe3Name: temp.probe3Name,
            }));
        })
    }

    const updateChamberName = (newInputValue: string) =>{
        let temp = tempState;
        temp.chamberName = newInputValue;
        socket.emit('smokeUpdate', {
            smoking: temp.smoking,
            chamberName: temp.chamberName,
            probe1Name: temp.probe1Name,
            probe2Name: temp.probe2Name,
            probe3Name: temp.probe3Name,
        });
        setTempState((prevState) => ({
            ...prevState,
            smoking: temp.smoking,
            chamberName: temp.chamberName,
            probe1Name: temp.probe1Name,
            probe2Name: temp.probe2Name,
            probe3Name: temp.probe3Name,
        }));
    }

    const updateProbe1Name = (newInputValue: string) =>{
        let temp = tempState;
        temp.probe1Name = newInputValue;
        socket.emit('smokeUpdate', {
            smoking: temp.smoking,
            chamberName: temp.chamberName,
            probe1Name: temp.probe1Name,
            probe2Name: temp.probe2Name,
            probe3Name: temp.probe3Name,
        });
        setTempState((prevState) => ({
            ...prevState,
            smoking: temp.smoking,
            chamberName: temp.chamberName,
            probe1Name: temp.probe1Name,
            probe2Name: temp.probe2Name,
            probe3Name: temp.probe3Name,
        }));       
    }

    const updateProbe2Name = (newInputValue: string) => {
        let temp = tempState;
        temp.probe2Name = newInputValue;
        socket.emit('smokeUpdate', {
            smoking: temp.smoking,
            chamberName: temp.chamberName,
            probe1Name: temp.probe1Name,
            probe2Name: temp.probe2Name,
            probe3Name: temp.probe3Name,
        });
        setTempState((prevState) => ({
            ...prevState,
            smoking: temp.smoking,
            chamberName: temp.chamberName,
            probe1Name: temp.probe1Name,
            probe2Name: temp.probe2Name,
            probe3Name: temp.probe3Name,
        }));       
    }  
    
    const updateProbe3Name = (newInputValue: string) =>{
        let temp = tempState;
        temp.probe3Name = newInputValue;
        socket.emit('smokeUpdate', {
            smoking: temp.smoking,
            chamberName: temp.chamberName,
            probe1Name: temp.probe1Name,
            probe2Name: temp.probe2Name,
            probe3Name: temp.probe3Name,
        });
        setTempState((prevState) => ({
            ...prevState,
            smoking: temp.smoking,
            chamberName: temp.chamberName,
            probe1Name: temp.probe1Name,
            probe2Name: temp.probe2Name,
            probe3Name: temp.probe3Name,
        }));      
    }


    return (
        <Grid item xs={12}>
            <Grid container direction="column" sx={{marginTop: '10px'}}>
                <Grid container direction="row" justifyContent='space-around' sx={{margin: '5px'}} color={'#1f4f2d'}>
                    <Input 
                        defaultValue="Chamber"
                        value={tempState.chamberName}
                        onChange={(event) => updateChamberName(event.target.value)}
                        sx={{
                            fontSize: 24,
                            fontWeight: 700,
                            color: '#1f4f2d',
                            width: '75%',
                        }}
                        disableUnderline={true}
                        />
                    <Grid item className='text' >
                        {tempState.chamberTemp}
                    </Grid>
                </Grid>
                <Divider variant="middle"/>
                <Grid container direction="row" justifyContent='space-around' sx={{margin: '5px'}} color={'#2a475e'}>
                    <Input 
                        defaultValue="Probe 1"
                        value={tempState.probe1Name}
                        onChange={(event) => updateProbe1Name(event.target.value)}
                        sx={{
                            fontSize: 24,
                            fontWeight: 700,
                            color: '#2a475e',
                            width: '75%',
                        }}
                        disableUnderline={true}
                        />
                    <Grid item className='text' >
                        {tempState.probeTemp1}
                    </Grid>
                </Grid>
                <Divider variant="middle"/>
                <Grid container direction="row" justifyContent='space-around' sx={{margin: '5px'}} color={'#118cd8'}>
                    <Input 
                        defaultValue="Probe 2"
                        value={tempState.probe2Name}
                        onChange={(event) => updateProbe2Name(event.target.value)}
                        sx={{
                            fontSize: 24,
                            fontWeight: 700,
                            color: '#118cd8',
                            width: '75%',
                        }}
                        disableUnderline={true}
                        />
                    <Grid item className='text' >
                        {tempState.probeTemp2}
                    </Grid>
                </Grid>
                <Divider variant="middle"/>
                <Grid container direction="row" justifyContent='space-around' sx={{margin: '5px'}} color={'#5582a7'}>
                    <Input 
                        defaultValue="Probe 3"
                        value={tempState.probe3Name}
                        onChange={(event) => updateProbe3Name(event.target.value)}
                        sx={{
                            fontSize: 24,
                            fontWeight: 700,
                            color: '#5582a7',
                            width: '75%',
                        }}
                        disableUnderline={true}
                        />
                    <Grid item className='text' >
                        {tempState.probeTemp3}
                    </Grid>
                </Grid>
                
            </Grid>
            <Grid item justifyContent='center'>
                <TempChart
                    ChamberTemp={parseFloat(tempState.chamberTemp)}
                    MeatTemp={parseFloat(tempState.probeTemp1)}
                    Meat2Temp={parseFloat(tempState.probeTemp2)}
                    Meat3Temp={parseFloat(tempState.probeTemp3)}
                    ChamberName={tempState.chamberName}
                    Probe1Name={tempState.probe1Name}
                    Probe2Name={tempState.probe2Name}
                    Probe3Name={tempState.probe3Name}
                    date={tempState.date}
                    smoking={tempState.smoking}
                    initData={initTemps}></TempChart>
            </Grid>
            <Grid container className="buttonContainer" justifyContent='space-around'>
                <Button
                className="button"
                variant="contained"
                size="small"
                onClick={() => startSmoke()}
                >{tempState.smoking ? 'Stop Smoking' : 'Start Smoking'}
                </Button>
            </Grid>
            <Grid container  direction="column">
                <Autocomplete
                    sx={{marginBottom: '10px'}}
                    freeSolo
                    options={woodType.map((option) => option)}
                    inputValue={tempState.woodType}
                    onInputChange={(event, newInputValue) => setTempState({...tempState, woodType: newInputValue})}
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
                        value={tempState.notes}
                        onChange={(event: any) => setTempState({...tempState, notes: event.target.value})}
                        rows={4}
                    />
                </Grid>
            </Grid>
            <Grid container className="buttonContainer" flexDirection='row-reverse'>
                {props.nextButton}
            </Grid>
        </Grid>
    );
}