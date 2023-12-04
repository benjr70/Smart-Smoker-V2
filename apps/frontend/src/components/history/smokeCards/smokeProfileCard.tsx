import { Card, CardContent, Grid, ThemeProvider, Typography, createTheme } from "@mui/material";
import React from "react";
import { smokeProfile } from "../../../Services/smokerService";
import TempChart, { TempData } from "../../common/components/tempChart";


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
                <TempChart
                    ChamberTemp={props.temps[0].ChamberTemp}
                    MeatTemp={props.temps[0].MeatTemp}
                    Meat2Temp={props.temps[0].Meat2Temp}
                    Meat3Temp={props.temps[0].Meat3Temp}
                    date={props.temps[0].date}
                    width={345}
                    height={200}
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