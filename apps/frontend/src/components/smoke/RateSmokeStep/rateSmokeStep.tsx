import { Grid, Rating, TextField, Typography } from "@mui/material";
import React from "react";

export class RateSmokeStep extends React.Component<{},{}> {
    

    render(): React.ReactNode {
        return(
        <Grid padding={3}>
            <Typography component="legend">Smoke Flavor</Typography>
            <Rating name="size-large" defaultValue={5} size="large" max={(10)} />
            <Typography component="legend">Texture</Typography>
            <Rating name="size-large" defaultValue={5} size="large" max={(10)} />
            <Typography component="legend">Moister</Typography>
            <Rating name="size-large" defaultValue={5} size="large" max={(10)} />
            <Typography component="legend">Overall Taste</Typography>
            <Rating name="size-large" defaultValue={5} size="large" max={(10)} />
            <TextField
               sx={{
                    marginTop: '10px',
                    marginBottom: '10px',
                    width: '350px'
                }}
                id="outlined-multiline-static"
                label="Notes"
                multiline
                // value={this.state.preSmokeState.notes}
                // onChange={this.updateNotes}
                rows={4}
            />
        </Grid>);
    }
}