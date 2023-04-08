import { Button, Card, CardActions, CardContent, Grid, ThemeProvider, Typography, createTheme } from "@mui/material";
import React from "react";


interface SmokeCardProps {
    name: string
    meatType: string
    date: string
    weight: string
    weightUnit: string
    smokeId: string
    woodType: string
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



export function SmokeCard(props: SmokeCardProps): JSX.Element {
    return (
    <Grid >
        <ThemeProvider theme={theme}>
        <Card className="card">
            <CardContent >
                <Typography variant="h5" component="div">
                    {props.name}
                </Typography>
                <Typography sx={{ fontSize: 14 }} color="text.secondary">
                    {props.weight}{props.weightUnit} {props.meatType} {props.woodType} wood
                </Typography>
                <Typography sx={{ fontSize: 14 }} color="text.secondary">
                    {props.date}
                </Typography>
                <CardActions>
                    <Button size="small">View</Button>
                </CardActions>
            </CardContent>
        </Card>
        </ThemeProvider>
    </Grid>);
}