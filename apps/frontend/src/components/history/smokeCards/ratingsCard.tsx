import { Card, CardContent, Grid, Rating, ThemeProvider, Typography, createTheme } from "@mui/material";
import React from "react";
import { preSmoke } from "../../common/interfaces/preSmoke";
import { PostSmoke } from "../../smoke/postSmokeStep/PostSmokeStep";
import { rating } from "../../common/interfaces/rating";


interface RatingsCardProps {
    ratings: rating
}

const theme = createTheme({
    components: {
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundColor: 'white',
                    borderRadius: '15px'
                }
            }
        }
    }
})



export function RatingsCard(props: RatingsCardProps): JSX.Element {
    return (
    <Grid>
        <ThemeProvider theme={theme}>
        <Card>
            <CardContent >
                <Typography variant="h5" component="div" align={'center'}>
                    Ratings
                </Typography>
                <Typography component="legend">Smoke Flavor: {props.ratings.smokeFlavor}</Typography>
                <Rating 
                    name="size-large" 
                    defaultValue={5} 
                    size="large" 
                    max={(10)}
                    value={props.ratings.smokeFlavor}

                />
                <Typography component="legend">Seasoning: {props.ratings.seasoning}</Typography>
                <Rating 
                    name="size-large" 
                    defaultValue={5} 
                    size="large" 
                    max={(10)}
                    value={props.ratings.seasoning}

                />
                <Typography component="legend">Tenderness: {props.ratings.tenderness}</Typography>
                <Rating 
                    name="size-large" 
                    defaultValue={5} 
                    size="large" 
                    max={(10)}
                    value={props.ratings.tenderness}
                />
                <Typography component="legend">Overall Taste: {props.ratings.overallTaste}</Typography>
                <Rating
                    name="size-large" 
                    defaultValue={5} 
                    size="large" 
                    max={(10)} 
                    value={props.ratings.overallTaste}
                    />
                </CardContent>
        </Card>
        </ThemeProvider>
    </Grid>);
}