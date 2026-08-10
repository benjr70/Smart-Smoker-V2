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
import { ProbeTargetsReadPort, useProbeTargets } from './useProbeTargets';
import { useTemperatureSeries } from './useTemperatureSeries';
import { Wifi } from './wifi/wifi';

/**
 * Anything carrying the four probe names.
 *
 * Every one of them is optional, because a name reaches this screen from a
 * stored smoke profile whose fields are all optional where it is stored, and
 * the session hands a profile's names on as it read them. A name nobody ever
 * wrote arrives missing rather than empty, and the kiosk is the one screen with
 * nowhere to go if reading one throws: no reload, no back button, and a cook
 * running.
 */
interface NamedProbes {
  chamberName?: string;
  probe1Name?: string;
  probe2Name?: string;
  probe3Name?: string;
}

/**
 * The names the chart labels its lines with, in the legend and under a finger.
 *
 * A profile can carry a name that was cleared rather than never set, and a
 * blank legend entry is not a legend, so a name that says nothing falls back to
 * one that does. The web application decides the same thing for its own charts
 * the same way (`chartNames.ts` there); the two are kept identical in what they
 * do with a name, and differ only in what they fall back to — this screen falls
 * back to the session's own default names, which are what the readouts beside
 * the chart show when no profile has been saved, so a line's label agrees with
 * the readout next to it rather than quietly renaming the same probe.
 */
const chartNamesOf = (named: NamedProbes): ChartSeriesNames => ({
  chamber: named.chamberName?.trim() || DEFAULT_PROBE_NAMES.chamberName,
  probe1: named.probe1Name?.trim() || DEFAULT_PROBE_NAMES.probe1Name,
  probe2: named.probe2Name?.trim() || DEFAULT_PROBE_NAMES.probe2Name,
  probe3: named.probe3Name?.trim() || DEFAULT_PROBE_NAMES.probe3Name,
});

/**
 * The smoker touchscreen home screen. A thin view over the shared session store
 * (smoker role): every temp, name, smoking flag, and connectivity signal comes
 * off the hook snapshot, and the two actions (toggle smoking, navigate) dispatch
 * store commands. All socket/serial wiring, offline batching, and payload
 * mapping now live in the session store behind the Provider — none of it in this
 * component.
 */
export interface HomeProps {
  /**
   * Where the configured targets are read from. Defaults to the settings this
   * appliance runs against; a screen assembled with its own reads whatever that
   * one says instead.
   */
  probeTargets?: ProbeTargetsReadPort;
}

export function Home({ probeTargets }: HomeProps = {}): JSX.Element {
  const session = useSmokeSession();
  // The cook so far, recorded and thinned by the hook; the chart is handed it
  // and draws it, and holds nothing of the cook itself.
  const series = useTemperatureSeries();
  const chartColors = useChartPalette();
  // What each meat is being cooked to, as the settings said when this panel was
  // switched on and when this cook was started; the chart rules a dashed line at
  // each one it is given.
  const chartTargets = useProbeTargets(session.smoking, probeTargets);
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
          {/* The chart is given the whole width of this row and takes its own
              height from the touchscreen shape, which is cut for the strip of
              the panel this row is (see home.style.css). No test hook of its
              own: the chart carries an accessible name, and "Temperature chart"
              is the handle a test and a reader both use. */}
          <Grid item xs={12}>
            <TemperatureChart
              data={series}
              names={chartNamesOf(session)}
              colors={chartColors}
              targets={chartTargets}
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
