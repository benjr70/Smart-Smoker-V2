import React from 'react';
import './home.style.css'
import Grid from '@mui/material/Grid';
import { readTemp } from '../../services/readSerial';

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
        // readTemp().on('data', (data: any) => {
        //     console.log(data);
        // })
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