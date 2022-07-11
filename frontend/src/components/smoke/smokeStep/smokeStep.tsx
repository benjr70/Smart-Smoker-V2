import React from "react";
import Grid from '@mui/material/Grid';
import './smokeStep.style.css'


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