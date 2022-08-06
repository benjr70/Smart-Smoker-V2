import React from "react";
import Grid from '@mui/material/Grid';
import './smokeStep.style.css'
// import { w3cwebsocket as W3CWebSocket } from "websocket";
import { io } from 'socket.io-client';

interface State {
    meatTemp: string;
    chamberTemp: string;
}
export class SmokeStep extends React.Component<{}, {tempState: State}> {

    constructor(props: any) {
        super(props);
        this.state = { tempState: {
            meatTemp: '0',
            chamberTemp: '0'
            }
        };
    }

    componentDidMount(): void {
        const socket = io('http://loaclhost:3001');
        socket.on('event', (message => {
            let tempObj = JSON.parse(message.data);
            let temp = this.state.tempState;
            temp.chamberTemp = tempObj.Chamber;
            temp.meatTemp = tempObj.Meat;
            this.setState({tempState: temp})
        }))
        // const client = new W3CWebSocket('http://localhost:3001');
        // client.onopen = () => {
        //     console.log('websocket connected')
        // };
        // client.onmessage = (message: any) => {
        //     let tempObj = JSON.parse(message.data);
        //     let temp = this.state.tempState;
        //     temp.chamberTemp = tempObj.Chamber;
        //     temp.meatTemp = tempObj.Meat;
        //     this.setState({tempState: temp})
        // }
    }


    render(): React.ReactNode {
        return (
            <Grid container>
                <Grid container direction="column">
                    <Grid container direction="row"  spacing={3}>
                        <Grid item xs={9} className='text' >
                            Meat Temp
                        </Grid>
                        <Grid item className='text' >
                            {this.state.tempState.meatTemp}
                        </Grid>
                    </Grid>
                    <Grid container direction="row" spacing={3}>
                        <Grid item xs={9} className='text' >
                            Chamber Temp
                        </Grid>
                        <Grid item className='text' >
                            {this.state.tempState.chamberTemp}
                        </Grid>
                    </Grid>
                </Grid>
            </Grid>
        );
    }
}