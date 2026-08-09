import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import { Button } from '@mui/material';
import Grid from '@mui/material/Grid';
import React, { useState } from 'react';
import TemperatureChart, { ChartSeriesNames } from 'temperaturechart/src/TemperatureChart';
import { useSmokeSession } from 'smoke-session/src/react';
import { DEFAULT_PROBE_NAMES } from 'smoke-session/src/session/domain';
import './home.style.css';
import { useChartPalette } from '../../theme/chartPalette';
import { useTemperatureSeries } from './useTemperatureSeries';
import { Wifi } from './wifi/wifi';

/** Anything carrying the four probe names, as the session holds them. */
interface NamedProbes {
  chamberName: string;
  probe1Name: string;
  probe2Name: string;
  probe3Name: string;
}

/**
 * The names the chart labels its lines with, in the legend and under a finger.
 *
 * A saved profile can carry a name that was cleared rather than never set, and
 * a blank legend entry is not a legend, so the same names the readouts fall
 * back to are used here — which is what keeps a line's label agreeing with the
 * readout beside it.
 */
const chartNamesOf = (named: NamedProbes): ChartSeriesNames => ({
  chamber: named.chamberName.trim() || DEFAULT_PROBE_NAMES.chamberName,
  probe1: named.probe1Name.trim() || DEFAULT_PROBE_NAMES.probe1Name,
  probe2: named.probe2Name.trim() || DEFAULT_PROBE_NAMES.probe2Name,
  probe3: named.probe3Name.trim() || DEFAULT_PROBE_NAMES.probe3Name,
});

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
  // The cook so far, recorded and thinned by the hook; the chart is handed it
  // and draws it, and holds nothing of the cook itself.
  const series = useTemperatureSeries();
  const chartColors = useChartPalette();
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
            {/* The readouts take the screen's text colour (see
                home.style.css). Painting each one in its own line's colour
                belongs with the mock's rebuilt touchscreen — the reading
                column, the status pill, the elapsed clock — which the theming
                PRD defers; the chart names its own lines in the legend under
                it, which is what tells a line from a line today. */}
            <Grid container spacing={2}>
              <Grid item className="text">
                {session.chamberName}
              </Grid>
              <Grid item className="text" data-testid="smoker-chamber-temp">
                {session.chamberTemp}
              </Grid>
            </Grid>
            <Grid container spacing={4}>
              <Grid item className="text">
                {session.probe2Name}
              </Grid>
              <Grid item className="text">
                {session.probeTemp2}
              </Grid>
            </Grid>
          </Grid>
          <Grid item xs={4} container justifyContent="space-evenly" alignItems="center">
            <Grid container spacing={2}>
              <Grid item className="text">
                {session.probe1Name}
              </Grid>
              <Grid item className="text">
                {session.probeTemp1}
              </Grid>
            </Grid>
            <Grid container spacing={2}>
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
          {/* No test hook of its own: the chart carries an accessible name, and
              "Temperature chart" is the handle a test and a reader both use. */}
          <Grid item xs={12} className="chart">
            <TemperatureChart
              data={series}
              names={chartNamesOf(session)}
              colors={chartColors}
              aspect="touchscreen"
            />
          </Grid>
        </>
      ) : (
        <Wifi onBack={goToScreen}></Wifi>
      )}
    </Grid>
  );
}
