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
    meatTemp: string;
    chamberTemp: string;
    smoking: boolean;
    date: Date;
} 


let initTemps: TempData[] = [];
let socket: any;
let batch: State[] = [];
let batchCount = 0;
export class Home extends React.Component<{}, {tempState: State, activeScreen: number, connection: boolean}> {

    constructor(props: any) {
        super(props);
        this.state = { tempState: {
            meatTemp: '0',
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
                temp.meatTemp = tempObj.Meat;
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
                MeatTemp: parseFloat(temp.meatTemp),
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
                <Grid container xs={7} direction="column" justifyContent='space-evenly'>
                    <Grid container direction="row"  spacing={2}>
                        <Grid item  className='text' >
                            Meat Temp
                        </Grid>
                        <Grid item className='text' >
                            {this.state.tempState.meatTemp}
                        </Grid>
                    </Grid>
                    <Grid container direction="row" spacing={2}>
                        <Grid item  className='text' >
                            Chamber Temp
                        </Grid>
                        <Grid item className='text' >
                            {this.state.tempState.chamberTemp}
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
                        MeatTemp={parseFloat(this.state.tempState.meatTemp)}
                        date={this.state.tempState.date}
                        smoking={this.state.tempState.smoking}
                        height={300}
                        width={800}
                        initData={initTemps}
                    ></TempChart>
                </Grid>
            </>  :
            <Wifi onBack={this.setActiveScreen}></Wifi>}
        </Grid>)
    }

}