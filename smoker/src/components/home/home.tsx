import React from 'react';
import './home.style.css'
import Grid from '@mui/material/Grid';
import { w3cwebsocket as W3CWebSocket } from "websocket";


interface State {
    meatTemp: number;
    chamberTemp: number;
}
export class Home extends React.Component<{}, {tempState: State}> {

    constructor(props: any) {
        super(props);
        this.state = { tempState: {
            meatTemp: 0,
            chamberTemp: 0
            }
        };
    }


    componentDidMount(){
        let meatAvg = [ 0];
        const client = new W3CWebSocket('ws://127.0.0.1:5678');
        client.onopen = () => {
            console.log('websocket connected')
        };
        client.onmessage = (message: any) => {
            console.log(message);
            let tempObj = JSON.parse(message.data);
            let temp = this.state.tempState;
            meatAvg.push(((tempObj.Meat * 9/5) + 32) - 200)
            if(meatAvg.length == 10) {
                temp.meatTemp = meatAvg.reduce((a,b) => a + b / meatAvg.length)
                meatAvg.shift();
            }
            temp.chamberTemp = ((tempObj.Chamber * 9/5) + 32) - 200;
            temp.meatTemp = ((tempObj.Meat * 9/5) + 32) - 200;
            this.setState({tempState: temp})
        }
    }

    render(): React.ReactNode { 
        return (
        <Grid container className='background'>
            <Grid container direction="column">
                <Grid container direction="row"  spacing={2}>
                    <Grid item xs={3} className='text' >
                        Meat Temp
                    </Grid>
                    <Grid item className='text' >
                        {this.state.tempState.meatTemp}
                    </Grid>
                </Grid>
                <Grid container direction="row" spacing={2}>
                    <Grid item xs={3} className='text' >
                        Chamber Temp
                    </Grid>
                    <Grid item className='text' >
                        {this.state.tempState.chamberTemp}
                    </Grid>
                </Grid>
            </Grid>
        </Grid>)
    }

}