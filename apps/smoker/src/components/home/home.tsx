import React, { useState } from 'react';
import './home.style.css'
import Grid from '@mui/material/Grid';
import { io } from 'socket.io-client';
import { Button } from '@mui/material';
import { getState, toggleSmoking } from '../../services/stateService';
import TempChart, { TempData } from '../common/tempChart';
import { getCurrentTemps, postTempsBatch } from '../../services/tempsService';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import { Wifi } from './wifi/wifi';
import { getConnection } from '../../services/deviceService';

interface State {
    probeTemp1: string;
    probeTemp2: string;
    probeTemp3: string;
    chamberTemp: string;
    smoking: boolean;
    date: Date;
} 


let initTemps: TempData[] = [];
let socket: any;
let batch: State[] = [];
let batchCount = 0;
export class Home extends React.Component<{}, {tempState: State, activeScreen: number, connection: boolean}> {
 // comment to test container update
    constructor(props: any) {
        super(props);
        this.state = { tempState: {
            probeTemp1: '0',
            probeTemp2: '0',
            probeTemp3: '0',
            chamberTemp: '0',
            smoking: false,
            date: new Date(),
            },
            activeScreen: 0,
            connection: true
        };
        this.setActiveScreen = this.setActiveScreen.bind(this);
    }

    async componentDidMount(){
        try{
            initTemps = await getCurrentTemps();
        } catch(e) {
            console.log(e);
        }
        getState().then(state => {
            let temp = this.state.tempState;
            temp.smoking = state.smoking
            this.setState({tempState: temp});
        })
        let deviceClient = io('http://127.0.0.1:3000');
        let url = process.env.REACT_APP_CLOUD_URL ?? '';
        socket = io(url);
        deviceClient.on('temp', (message: any) => {
            try{
                getConnection().then(result => {
                    if(result.length > 0){
                        this.setState({connection: true});
                    } else {
                        this.setState({connection: false});
                    }
                })
                let tempObj = JSON.parse(message);
                let temp = this.state.tempState;
                temp.chamberTemp = tempObj.Chamber;
                temp.probeTemp1 = tempObj.Meat;
                temp.probeTemp2 = tempObj.Meat2;
                temp.probeTemp3 = tempObj.Meat3;
                temp.date = new Date();
                this.setState({tempState: temp})
                if(socket.connected){
                    if(batch.length > 0){
                        this.sendTempBatch();
                        socket.emit('refresh');
                        batch = [];
                    }
                    socket.emit('events', JSON.stringify(temp));
                } else {
                    batchCount++;
                    if(batchCount > 10){
                        batch.push(JSON.parse(JSON.stringify(temp)));
                        batchCount = 0;
                    }
                }
            } catch(e) {
                console.log(e);
            }
        });
        
        socket.on('smokeUpdate', ((message :any) => {
            let temp = this.state.tempState;
            temp.smoking = message;
            this.setState({tempState: temp});
        }))

        socket.on('clear', ((message: any) => {
            initTemps = [];
        }))
    }


    sendTempBatch(): Promise<void> {
        const tempBatch: TempData[] = batch.map(temp => {
            return {
                ChamberTemp: parseFloat(temp.chamberTemp),
                MeatTemp: parseFloat(temp.probeTemp1),
                Meat2Temp: parseFloat(temp.probeTemp2),
                Meat3Temp: parseFloat(temp.probeTemp3),
                date: temp.date,
            }
        });
       return postTempsBatch(tempBatch);
    }

    startSmoke(): void {
        toggleSmoking().then(state => {
            let temp = this.state.tempState;
            temp.smoking = state.smoking
            socket.emit('smokeUpdate', state.smoking);
            this.setState({tempState: temp});
        })
    }

    setActiveScreen(screen: number): void {
        this.setState({activeScreen: screen});
    }

    render(): React.ReactNode { 
        return (
        <Grid container direction='row' className='background'>
            {this.state.activeScreen === 0 ? 
            <>
                <Grid container xs={4} direction="column" justifyContent='space-evenly'>
                    <Grid container direction="row"  spacing={2} color={'#1f4f2d'}>
                        <Grid item  className='text' >
                            Chamber
                        </Grid>
                        <Grid item className='text' >
                            {this.state.tempState.chamberTemp}
                        </Grid>
                    </Grid>
                    <Grid container direction="row" spacing={4} color={'#118cd8'}>
                        <Grid item  className='text' >
                            Probe 2  
                        </Grid>
                        <Grid item className='text' >
                            {this.state.tempState.probeTemp2}
                        </Grid>
                    </Grid>
                </Grid>
                <Grid container xs={3} direction="column" justifyContent='space-evenly'>
                    <Grid container direction="row"  spacing={2} color={'#2a475e'}>
                        <Grid item  className='text' >
                            Probe 1 
                        </Grid>
                        <Grid item className='text' >
                            {this.state.tempState.probeTemp1}
                        </Grid>
                    </Grid>
                    <Grid container direction="row" spacing={2} color={'#5582a7'}>
                        <Grid item  className='text' >
                            Probe 3 
                        </Grid>
                        <Grid item className='text' >
                            {this.state.tempState.probeTemp3}
                        </Grid>
                    </Grid>
                </Grid>
                <Grid container  xs={5}>
                    <Grid container className="buttonContainer" flexDirection='row-reverse'>
                            <Grid item padding={1}>
                                <Button
                                className="wifiButton"
                                variant="contained"
                                size="small"
                                onClick={() => this.setActiveScreen(1)}>
                                   {this.state.connection ? <WifiIcon/> : <WifiOffIcon/>}
                                </Button>
                            </Grid>
                            <Grid item padding={1}>
                                <Button
                                className="button"
                                variant="contained"
                                size="small"
                                onClick={() => this.startSmoke()}
                                >{this.state.tempState.smoking ? 'Stop Smoking' : 'Start Smoking'}
                                </Button>
                            </Grid>
                    </Grid>
                </Grid>
                <Grid>
                    <TempChart
                        ChamberTemp={parseFloat(this.state.tempState.chamberTemp)}
                        MeatTemp={parseFloat(this.state.tempState.probeTemp1)}
                        Meat2Temp={parseFloat(this.state.tempState.probeTemp2)}
                        Meat3Temp={parseFloat(this.state.tempState.probeTemp3)}
                        date={this.state.tempState.date}
                        smoking={this.state.tempState.smoking}
                        height={380}
                        width={800}
                        initData={initTemps}
                    ></TempChart>
                </Grid>
            </>  :
            <Wifi onBack={this.setActiveScreen}></Wifi>}
        </Grid>)
    }

}