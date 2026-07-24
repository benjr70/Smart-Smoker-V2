import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import { Button } from '@mui/material';
import Grid from '@mui/material/Grid';
import React, { useState } from 'react';
import TempChart from 'temperaturechart/src/tempChart';
import { useSmokeSession } from 'smoke-session/src/react';
import './home.style.css';
import { Wifi } from './wifi/wifi';

/**
 * The smoker touchscreen home screen. A thin view over the shared session store
 * (smoker role): every temp, name, smoking flag, and connectivity signal comes
 * off the hook snapshot, and the two actions (toggle smoking, navigate) dispatch
 * store commands. All socket/serial wiring, offline batching, and payload
 * mapping now live in the session store behind the Provider — none of it in this
 * component.
 */
export function Home(): JSX.Element {
  const session = useSmokeSession();
  // The only genuinely local state: which sub-screen is showing. Returning to
  // the home screen refreshes the chart baseline (the wifi screen may have run
  // for a while).
  const [activeScreen, setActiveScreen] = useState(0);

  const goToScreen = (screen: number): void => {
    setActiveScreen(screen);
    if (screen === 0) {
      void session.refreshInitialTemps();
    }
  };

  return (
    <Grid container className="background">
      {activeScreen === 0 ? (
        <>
          <Grid item xs={4} container justifyContent="space-evenly" alignItems="center">
            <Grid container spacing={2} color={'#1f4f2d'}>
              <Grid item className="text">
                {session.chamberName}
              </Grid>
              <Grid item className="text" data-testid="smoker-chamber-temp">
                {session.chamberTemp}
              </Grid>
            </Grid>
            <Grid container spacing={4} color={'#118cd8'}>
              <Grid item className="text">
                {session.probe2Name}
              </Grid>
              <Grid item className="text">
                {session.probeTemp2}
              </Grid>
            </Grid>
          </Grid>
          <Grid item xs={4} container justifyContent="space-evenly" alignItems="center">
            <Grid container spacing={2} color={'#2a475e'}>
              <Grid item className="text">
                {session.probe1Name}
              </Grid>
              <Grid item className="text">
                {session.probeTemp1}
              </Grid>
            </Grid>
            <Grid container spacing={2} color={'#5582a7'}>
              <Grid item className="text">
                {session.probe3Name}
              </Grid>
              <Grid item className="text">
                {session.probeTemp3}
              </Grid>
            </Grid>
          </Grid>
          <Grid item xs={4}>
            <Grid container className="buttonContainer" flexDirection="row-reverse">
              <Grid item padding={1}>
                <Button
                  className="wifiButton"
                  variant="contained"
                  size="small"
                  aria-label={session.wifiConnected ? 'wifi connected' : 'wifi disconnected'}
                  onClick={() => goToScreen(1)}
                >
                  {session.wifiConnected ? <WifiIcon /> : <WifiOffIcon />}
                </Button>
              </Grid>
              <Grid item padding={1}>
                <Button
                  className="button"
                  variant="contained"
                  size="small"
                  data-testid="smoker-start-button"
                  onClick={() => void session.toggleSmoking()}
                >
                  {session.smoking ? 'Stop Smoking' : 'Start Smoking'}
                </Button>
              </Grid>
            </Grid>
          </Grid>
          <Grid item xs={12} style={{ height: '83vh' }}>
            <TempChart
              ChamberTemp={parseFloat(session.chamberTemp)}
              MeatTemp={parseFloat(session.probeTemp1)}
              Meat2Temp={parseFloat(session.probeTemp2)}
              Meat3Temp={parseFloat(session.probeTemp3)}
              ChamberName={session.chamberName}
              Probe1Name={session.probe1Name}
              Probe2Name={session.probe2Name}
              Probe3Name={session.probe3Name}
              date={session.date}
              smoking={session.smoking}
              initData={session.initialTemps}
            ></TempChart>
          </Grid>
        </>
      ) : (
        <Wifi onBack={goToScreen}></Wifi>
      )}
    </Grid>
  );
}
