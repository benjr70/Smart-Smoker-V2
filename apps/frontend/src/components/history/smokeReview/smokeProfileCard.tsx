import { Card, CardContent, Grid, ThemeProvider, Typography, createTheme } from "@mui/material";
import React from "react";
import { smokeProfile } from "../../../Services/smokerService";


interface SmokeProfileCardProps {
    smokeProfile: smokeProfile;
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