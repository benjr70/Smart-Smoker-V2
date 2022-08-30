import React from 'react';
import './home.style.css'
import Grid from '@mui/material/Grid';
 import { w3cwebsocket as W3CWebSocket } from "websocket";
import { io } from 'socket.io-client';
import { SocketAddress } from 'net';
import { Button } from '@mui/material';
import { getState, toggleSmoking } from '../../services/stateService';


interface State {
    meatTemp: string;
    chamberTemp: string;
    smoking: boolean;
}
export class Home extends React.Component<{}, {tempState: State}> {

    constructor(props: any) {
        super(props);
        this.state = { tempState: {
            meatTemp: '0',
            chamberTemp: '0',
            smoking: false,
            }
        };
    }


    componentDidMount(){
        getState().then(state => {
            let temp = this.state.tempState;
            temp.smoking = state.smoking
            this.setState({tempState: temp});
        })
        let meatAvg = [0];
        let chamberAvg = [0];
        const client = new W3CWebSocket('ws://127.0.0.1:5678');
        const socket = io('http://136.60.164.223:3001');
        //const socket = io('http://192.168.1.229:3001');
        client.onopen = () => {
            console.log('websocket connected')
        };
        client.onmessage = (message: any) => {
            let tempObj = JSON.parse(message.data);
            let temp = this.state.tempState;
            if(!(parseFloat(tempObj.Meat) > parseFloat(temp.meatTemp) + 10) && !(parseFloat(tempObj.Meat) < parseFloat(temp.meatTemp) - 10)){
                meatAvg.push(parseFloat(tempObj.Meat));
            }
            if(!(parseFloat(tempObj.Chamber) > parseFloat(temp.chamberTemp) + 10) && !(parseFloat(tempObj.Chamber) < parseFloat(temp.chamberTemp) - 10)){
                chamberAvg.push(parseFloat(tempObj.Chamber));
            }
            if(meatAvg.length === 5) {
                temp.meatTemp = (meatAvg.reduce((a,b) => a + b, 0) / meatAvg.length).toFixed(1)
                temp.chamberTemp = (chamberAvg.reduce((a,b) => a + b, 0) / chamberAvg.length).toFixed(1)
                meatAvg.shift();
                chamberAvg.shift();
            } else {
                meatAvg.push(parseFloat(tempObj.Meat));
                chamberAvg.push(parseFloat(tempObj.Chamber));
            }
            this.setState({tempState: temp})
            socket.emit('events', JSON.stringify(temp));
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
        </Grid>)
    }

}