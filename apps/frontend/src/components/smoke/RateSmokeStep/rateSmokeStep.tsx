import { Grid, Rating, TextField, Typography } from "@mui/material";
import React from "react";
import { rating } from "../../common/interfaces/rating";

export class RateSmokeStep extends React.Component<{},{ratingState: rating}> {

    constructor(props:any){
        super(props);
        this.state = {ratingState: {
            smokeFlavor: 5,
            seasoning: 5,
            tenderness: 5,
            overallTaste: 8,
            notes: '',
        }}

        this.updateValues = this.updateValues.bind(this);
    }

    updateValues(event: any, field: string){
        let temp = this.state.ratingState;
        switch(field){
            case 'smokeFlavor': { 
                temp.smokeFlavor = event.target.value;
                break;
            }
            case 'seasoning': { 
                temp.seasoning = event.target.value;
                break;
            }
            case 'tenderness': { 
                temp.tenderness = event.target.value;
                break;
            }
            case 'overallTaste': { 
                temp.overallTaste = event.target.value;
                break;
            }
            case 'notes': { 
                temp.notes = event.target.value;
                break;
            }
        }
        
        this.setState({ratingState: temp});
    }
    

    render(): React.ReactNode {
        return(
        <Grid padding={3}>
            <Typography component="legend">Smoke Flavor</Typography>
            <Rating 
                name="size-large" 
                defaultValue={5} 
                size="large" 
                max={(10)}
                value={this.state.ratingState.smokeFlavor}
                onChange={(event) => {this.updateValues(event, 'smokeFlavor')}} 
            />{this.state.ratingState.smokeFlavor}
            <Typography component="legend">Seasoning</Typography>
            <Rating 
                name="size-large" 
                defaultValue={5} 
                size="large" 
                max={(10)}
                value={this.state.ratingState.seasoning}
                onChange={(event) => {this.updateValues(event, 'seasoning')}} 
            />{this.state.ratingState.seasoning}
            <Typography component="legend">tenderness</Typography>
            <Rating 
                name="size-large" 
                defaultValue={5} 
                size="large" 
                max={(10)}
                value={this.state.ratingState.tenderness}
                onChange={(event) => {this.updateValues(event, 'tenderness')}}
            />{this.state.ratingState.tenderness}
            <Typography component="legend">Overall Taste</Typography>
            <Rating
                name="size-large" 
                defaultValue={5} 
                size="large" 
                max={(10)} 
                value={this.state.ratingState.overallTaste}
                onChange={(event) => {this.updateValues(event, 'overallTaste')}}
                />{this.state.ratingState.overallTaste}
            <TextField
               sx={{
                    marginTop: '10px',
                    marginBottom: '10px',
                    width: '350px'
                }}
                id="outlined-multiline-static"
                label="Notes"
                multiline
                value={this.state.ratingState.notes}
                onChange={(event) => {this.updateValues(event, 'notes')}}
                rows={4}
            />
        </Grid>);
    }
}