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
let socket: any;
let buffer: State[] = [];
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
        const client = new W3CWebSocket('ws://127.0.0.1:5678');
        let url = process.env.REACT_APP_CLOUD_URL ?? '';
        socket = io(url);
        client.onopen = () => {
            console.log('websocket connected')
        };
        client.onmessage = async (message: any) => {
            try{
                let tempObj = JSON.parse(message.data);
                let temp = this.state.tempState;
                temp.chamberTemp = tempObj.Chamber;
                temp.meatTemp = tempObj.Meat;
                temp.date = new Date();
                this.setState({tempState: temp})
                //push to Q
                buffer.push(temp);
                // Q lenght is > 1 loop
                console.log('before check', socket.connected, buffer.length);
                if(socket.connected){
                    // while(buffer.length >= 1){
                    if(buffer.length === 1) {
                        const temp2 = buffer.shift();
                        socket.emit('events', JSON.stringify( temp2));
                        console.log('emit1', temp2);
                    } else if (buffer.length > 1){
                        const temp3 = buffer.shift();
                        socket.emit('events', JSON.stringify( temp3));
                        console.log('emit2', temp3);
                        await this.timeout(100);
                        const temp4 = buffer.shift();
                        socket.emit('events', JSON.stringify( temp4));
                        console.log('emit3', temp4); 
                    }
         
                     // await this.timeout(300);
                    // }
                }
            } catch(e) {
                console.log(e);
            }
        }
        
        socket.on('smokeUpdate', ((message :any) => {
            let temp = this.state.tempState;
            temp.smoking = message;
            this.setState({tempState: temp});
        }))

        socket.on('clear', ((message: any) => {
            initTemps = [];
        }))
    }

    timeout(delay: number) {
        return new Promise( res => setTimeout(res, delay) );
    }

    startSmoke(): void {
        toggleSmoking().then(state => {
            let temp = this.state.tempState;
            temp.smoking = state.smoking
            socket.emit('smokeUpdate', state.smoking);
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