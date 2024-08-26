import { Card, CardContent, Grid, Rating, ThemeProvider, Typography, createTheme } from "@mui/material";
import React, { useEffect, useState } from "react";
import { preSmoke } from "../../common/interfaces/preSmoke";
import { PostSmoke } from "../../smoke/postSmokeStep/PostSmokeStep";
import { rating } from "../../common/interfaces/rating";
import { setCurrentRatings } from "../../../Services/ratingsService";


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

    const [ratings, setRatings] = useState<rating>(props.ratings)
    
    useEffect(() => {
        setRatings(props.ratings)
    }, [props.ratings])

    useEffect(() => {
        return () => {
            // setCurrentRatings(ratings);
        }
    })

    return (
    <Grid>
        <ThemeProvider theme={theme}>
        <Card>
            <CardContent >
                <Typography variant="h5" component="div" align={'center'}>
                    Ratings
                </Typography>
                <Typography component="legend">Smoke Flavor: {ratings.smokeFlavor}</Typography>
                <Rating 
                    name="size-large" 
                    defaultValue={5} 
                    size="large" 
                    max={(10)}
                    value={ratings.smokeFlavor}
                    onChange={(event) => {setRatings({...ratings, smokeFlavor: parseFloat((event.target as HTMLInputElement).value)})}}  
                />
                <Typography component="legend">Seasoning: {ratings.seasoning}</Typography>
                <Rating 
                    name="size-large" 
                    defaultValue={5} 
                    size="large" 
                    max={(10)}
                    value={ratings.seasoning}
                    onChange={(event) => {setRatings({...ratings, seasoning: parseFloat((event.target as HTMLInputElement).value)})}}  
                />
                <Typography component="legend">Tenderness: {ratings.tenderness}</Typography>
                <Rating 
                    name="size-large" 
                    defaultValue={5} 
                    size="large" 
                    max={(10)}
                    value={ratings.tenderness}
                    onChange={(event) => {setRatings({...ratings, tenderness: parseFloat((event.target as HTMLInputElement).value)})}}  
                />
                <Typography component="legend">Overall Taste: {ratings.overallTaste}</Typography>
                <Rating
                    name="size-large" 
                    defaultValue={5} 
                    size="large" 
                    max={(10)} 
                    value={ratings.overallTaste}
                    onChange={(event) => {setRatings({...ratings, overallTaste: parseFloat((event.target as HTMLInputElement).value)})}}  
                    />
                </CardContent>
        </Card>
        </ThemeProvider>
    </Grid>);
}