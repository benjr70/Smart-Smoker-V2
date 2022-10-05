import React from 'react';
import './home.style.css'
import Grid from '@mui/material/Grid';
 import { w3cwebsocket as W3CWebSocket } from "websocket";
import { io } from 'socket.io-client';
import { Button } from '@mui/material';
import { getState, toggleSmoking } from '../../services/stateService';
import TempChart, { TempData } from '../common/tempChart';
import { getCurrentTemps } from '../../services/tempsService';


interface State {
    meatTemp: string;
    chamberTemp: string;
    smoking: boolean;
    date: Date;
}

let initTemps: TempData[] = [];

export class Home extends React.Component<{}, {tempState: State}> {

    constructor(props: any) {
        super(props);
        this.state = { tempState: {
            meatTemp: '0',
            chamberTemp: '0',
            smoking: false,
            date: new Date(),
            }
        };
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
        let meatAvg = [0];
        let chamberAvg = [0];
        const client = new W3CWebSocket('ws://127.0.0.1:5678');
        let url = process.env.REACT_APP_CLOUD_URL ?? '';
        const socket = io(url);
        client.onopen = () => {
            console.log('websocket connected')
        };
        client.onmessage = (message: any) => {
            try{
                let tempObj = JSON.parse(message.data);
                let temp = this.state.tempState;
                temp.chamberTemp = tempObj.Chamber;
                temp.meatTemp = tempObj.Meat;
                // if(!(parseFloat(tempObj.Meat) > parseFloat(temp.meatTemp) + 5) && !(parseFloat(tempObj.Meat) < parseFloat(temp.meatTemp) - 5)){
                //     meatAvg.push(parseFloat(tempObj.Meat));
                // }
                // if(!(parseFloat(tempObj.Chamber) > parseFloat(temp.chamberTemp) + 5) && !(parseFloat(tempObj.Chamber) < parseFloat(temp.chamberTemp) - 5)){
                //     chamberAvg.push(parseFloat(tempObj.Chamber));
                // }
                // if(meatAvg.length === 5) {
                //     temp.meatTemp = (meatAvg.reduce((a,b) => a + b, 0) / meatAvg.length).toFixed(1)
                //     temp.chamberTemp = (chamberAvg.reduce((a,b) => a + b, 0) / chamberAvg.length).toFixed(1)
                //     meatAvg.shift();
                //     chamberAvg.shift();
                // } else {
                //     meatAvg.push(parseFloat(tempObj.Meat));
                //     chamberAvg.push(parseFloat(tempObj.Chamber));
                // }
                temp.date = new Date();
                this.setState({tempState: temp})
                socket.emit('events', JSON.stringify(temp));
            } catch(e) {
                console.log(e);
            }
        }
    }

    startSmoke(): void {
        toggleSmoking().then(state => {
            let temp = this.state.tempState;
            temp.smoking = state.smoking
            this.setState({tempState: temp});
        })
    }

    render(): React.ReactNode { 
        return (
        <Grid container direction='row' className='background'>
            <Grid container xs={9} direction="column">
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
            <Grid container  xs={3}>
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
        </Grid>)
    }

}