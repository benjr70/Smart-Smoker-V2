import { Card, CardContent, Grid, ThemeProvider, Typography, createTheme } from "@mui/material";
import React from "react";



export function NotificationsCard(): JSX.Element {
    return (
    <Grid paddingBottom={1}>
        <Card>
            <CardContent >
                <Typography variant="h5" component="div" align={'center'}>
                    Notifications
                </Typography>
                <Typography sx={{ fontSize: 14 }} paddingBottom={1} color="text.secondary">
                    Notifications are currently disabled.
                </Typography>
            </CardContent>
        </Card>
    </Grid>);
}