import { Card, CardContent, Grid, ThemeProvider, Typography, createTheme } from "@mui/material";
import React from "react";
import { preSmoke } from "../../common/interfaces/preSmoke";
import { PostSmoke } from "../../smoke/postSmokeStep/PostSmokeStep";


interface preSmokeCardProps {
    postSmoke: PostSmoke
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



export function PostSmokeCard(props: preSmokeCardProps): JSX.Element {
    return (
    <Grid paddingBottom={1}>
        <ThemeProvider theme={theme}>
        <Card>
            <CardContent >
                <Typography variant="h5" component="div" align={'center'}>
                    PostSmoke
                </Typography>
                <Typography variant="h6" component="div">
                    Rest Time: {props.postSmoke.restTime}
                </Typography>
                {props.postSmoke.steps.map((step, index) => {
                    return (<Typography sx={{ fontSize: 18 }} key={`post-smoker-card-${index}`}>
                        {index + 1}. {step}
                    </Typography>)
                })}
                <Typography padding={1} sx={{ fontSize: 14 }} paragraph={true} color="text.secondary">
                    {props.postSmoke.notes}
                </Typography>
            </CardContent>
        </Card>
        </ThemeProvider>
    </Grid>);
}