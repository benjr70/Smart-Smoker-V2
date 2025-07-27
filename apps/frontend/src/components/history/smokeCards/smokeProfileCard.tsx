import { Card, CardContent, Grid, ThemeProvider, Typography, createTheme } from "@mui/material";
import React from "react";
import { smokeProfile } from "../../../Services/smokerService";
import  TempChart, { TempData } from 'temperaturechart/src/tempChart';


interface SmokeProfileCardProps {
    smokeProfile: smokeProfile;
    temps: TempData[];
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



export function SmokeProfileCard(props: SmokeProfileCardProps): JSX.Element {
    return (
    <Grid paddingBottom={1}>
        <ThemeProvider theme={theme}>
        <Card>
            <CardContent >
                <Typography variant="h5" component="div" align={'center'}>
                    Smoke
                </Typography>
                <Typography  
                    sx={{
                        fontSize: 18,
                        fontWeight: 700,
                        width: '75%',
                    }} >
                    Probes
                </Typography>
                <Typography  
                    sx={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: '#1f4f2d',
                        width: '75%',
                    }} >
                    {props.smokeProfile.chamberName ?? 'Chamber'}
                </Typography>
                <Typography  
                    sx={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: '#2a475e',
                        width: '75%',
                    }} >
                    {props.smokeProfile.probe1Name ?? 'Probe 1'}
                </Typography>
                <Typography  
                    sx={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: '#118cd8',
                        width: '75%',
                    }} >
                    {props.smokeProfile.probe2Name ?? 'Probe 2'}
                </Typography>
                <Typography  
                    sx={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: '#5582a7',
                        width: '75%',
                    }} >
                    {props.smokeProfile.probe3Name ?? 'Probe 3'}
                </Typography>
               
                <TempChart
                    ChamberTemp={props.temps.length > 0 ? props.temps[props.temps.length - 1].ChamberTemp : 0}
                    MeatTemp={props.temps.length > 0 ? props.temps[props.temps.length - 1].MeatTemp : 0}
                    Meat2Temp={props.temps.length > 0 ? props.temps[props.temps.length - 1].Meat2Temp : 0}
                    Meat3Temp={props.temps.length > 0 ? props.temps[props.temps.length - 1].Meat3Temp : 0}
                    ChamberName={props.smokeProfile.chamberName ?? 'Chamber'}
                    Probe1Name={props.smokeProfile.probe1Name ?? 'Probe 1'}
                    Probe2Name={props.smokeProfile.probe2Name ?? 'Probe 2'}
                    Probe3Name={props.smokeProfile.probe3Name ?? 'Probe 3'}
                    date={props.temps.length > 0 ? props.temps[props.temps.length - 1].date : new Date()}
                    smoking={false}
                    initData={props.temps}
                />
                <Typography sx={{ fontSize: 18 }}>
                        {props.smokeProfile.woodType} Wood
                </Typography>
                <Typography padding={1} sx={{ fontSize: 14 }} paragraph={true} color="text.secondary">
                    {props.smokeProfile.notes}
                </Typography>
            </CardContent>
        </Card>
        </ThemeProvider>
    </Grid>);
}