import { Card, CardContent, Grid, ThemeProvider, Typography, createTheme } from '@mui/material';
import React from 'react'
import { NotificationsCard } from './notifications';

declare const VERSION: string; 

const theme = createTheme({
  components: {
      MuiCard: {
          styleOverrides: {
              root: {
                  backgroundColor: 'white',
                  borderRadius: '15px',
              }
          }
      }
  }
})

export const settings = () => {
    let versionToDisplay = "unknown";
    try {
      versionToDisplay = VERSION;
    } catch (error) {
      console.log("Cannot get version of application.");
    }
    return (
      <Grid container sx={{display: 'flex', justifyContent: 'center', minHeight: 'calc(100vh - 56px)'}} spacing={2}  >
        <Grid item xs={11.5} >
          <Typography variant="h5" component="div" padding={1}>
                      Settings
          </Typography>
          <ThemeProvider theme={theme}>

          <NotificationsCard/>

            <Grid paddingBottom={1}>
              <Card className="card">
                <CardContent  >
                  <Grid  item xs={11}>
                      {`Version: ${versionToDisplay}`}
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

          </ThemeProvider>
        </Grid>
      </Grid>
    );
}