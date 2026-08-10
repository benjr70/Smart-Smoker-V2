import React, { useEffect, useRef } from 'react';
import Grid from '@mui/material/Grid';
import './smokeStep.style.css';
import { Autocomplete, Button, Divider, Input, TextField } from '@mui/material';
import TemperatureChart from 'temperaturechart/src/TemperatureChart';
import { SmokeSessionProvider, useSmokeSession } from 'smoke-session/src/react';
import { CloudSocketAdapter, createCloudSocketAdapter, SessionConfig } from 'smoke-session/src';
import { getDefaultApiClient, useCookStart } from '../../../api';
import { createSessionApiPort } from '../../../api/sessionApiAdapter';
import { useChartPalette } from '../../../theme';
import { chartNamesOf } from '../../common/chartNames';
import { SmokeStatusBar } from './SmokeStatusBar';
import { useProbeTargets } from './useProbeTargets';
import { useTemperatureSeries } from './useTemperatureSeries';

const woodType = ['Hickory', 'Post Oak', 'Pecan', 'Cherry', 'Apple'];

type SmokeStepProps = {
  nextButton: JSX.Element;
};

/**
 * The smoke step as a thin view over the shared session module. It renders
 * exclusively from the hook snapshot and dispatches only session commands —
 * there is no socket.io import, no module-level mutable state, and no
 * hand-built `smokeUpdate` payload here anymore. The four legacy copy-pasted
 * probe-rename functions collapse into one {@link SmokeSessionCommands.setName}
 * dispatch per field.
 *
 * `flushProfileOnUnmount` reproduces the legacy save-on-leave: leaving the step
 * unmounts this view and persists the profile draft (names + notes + wood type)
 * exactly as the old unmount effect did.
 */
export function SmokeStepView(props: SmokeStepProps): JSX.Element {
  const session = useSmokeSession({ flushProfileOnUnmount: true });
  // The cook so far, recorded and thinned by the hook; the chart is handed it
  // and draws it, and holds nothing of the cook itself.
  const series = useTemperatureSeries();
  const chartColors = useChartPalette();
  // What each meat is being cooked to, from the notification settings; the chart
  // rules a dashed line at each one it is given.
  const chartTargets = useProbeTargets();
  // When the cook started, as the backend stamped it — re-read whenever smoking
  // is switched, which is the moment the stamp is written.
  const startedAt = useCookStart(session.smoking);

  return (
    <Grid item xs={12}>
      <Grid container direction="column" sx={{ marginTop: '10px' }}>
        <SmokeStatusBar smoking={session.smoking} startedAt={startedAt} />
        <Grid container direction="row" justifyContent="space-around" sx={{ margin: '5px' }}>
          <Input
            defaultValue="Chamber"
            value={session.chamberName}
            onChange={event => session.setName('chamber', event.target.value)}
            sx={theme => ({
              fontSize: 24,
              fontWeight: 700,
              color: theme.design.probes.chamber,
              width: '75%',
            })}
            disableUnderline={true}
            inputProps={{ 'data-testid': 'smoke-chamber-name-input' }}
          />
          <Grid
            item
            className="text"
            data-testid="smoke-chamber-temp"
            sx={theme => ({ color: theme.design.probes.chamber })}
          >
            {session.chamberTemp}
          </Grid>
        </Grid>
        <Divider variant="middle" />
        <Grid container direction="row" justifyContent="space-around" sx={{ margin: '5px' }}>
          <Input
            defaultValue="Probe 1"
            value={session.probe1Name}
            onChange={event => session.setName('probe1', event.target.value)}
            sx={theme => ({
              fontSize: 24,
              fontWeight: 700,
              color: theme.design.probes.probe1,
              width: '75%',
            })}
            disableUnderline={true}
            inputProps={{ 'data-testid': 'smoke-probe1-name-input' }}
          />
          <Grid
            item
            className="text"
            data-testid="smoke-probe1-temp"
            sx={theme => ({ color: theme.design.probes.probe1 })}
          >
            {session.probeTemp1}
          </Grid>
        </Grid>
        <Divider variant="middle" />
        <Grid container direction="row" justifyContent="space-around" sx={{ margin: '5px' }}>
          <Input
            defaultValue="Probe 2"
            value={session.probe2Name}
            onChange={event => session.setName('probe2', event.target.value)}
            sx={theme => ({
              fontSize: 24,
              fontWeight: 700,
              color: theme.design.probes.probe2,
              width: '75%',
            })}
            disableUnderline={true}
            inputProps={{ 'data-testid': 'smoke-probe2-name-input' }}
          />
          <Grid
            item
            className="text"
            data-testid="smoke-probe2-temp"
            sx={theme => ({ color: theme.design.probes.probe2 })}
          >
            {session.probeTemp2}
          </Grid>
        </Grid>
        <Divider variant="middle" />
        <Grid container direction="row" justifyContent="space-around" sx={{ margin: '5px' }}>
          <Input
            defaultValue="Probe 3"
            value={session.probe3Name}
            onChange={event => session.setName('probe3', event.target.value)}
            sx={theme => ({
              fontSize: 24,
              fontWeight: 700,
              color: theme.design.probes.probe3,
              width: '75%',
            })}
            disableUnderline={true}
            inputProps={{ 'data-testid': 'smoke-probe3-name-input' }}
          />
          <Grid
            item
            className="text"
            data-testid="smoke-probe3-temp"
            sx={theme => ({ color: theme.design.probes.probe3 })}
          >
            {session.probeTemp3}
          </Grid>
        </Grid>
      </Grid>
      <Grid item justifyContent="center" data-testid="smoke-chart">
        <TemperatureChart
          data={series}
          names={chartNamesOf({
            chamberName: session.chamberName,
            probe1Name: session.probe1Name,
            probe2Name: session.probe2Name,
            probe3Name: session.probe3Name,
          })}
          colors={chartColors}
          targets={chartTargets}
        />
      </Grid>
      <Grid container className="buttonContainer" justifyContent="space-around">
        <Button
          className="button"
          variant="contained"
          size="small"
          data-testid="smoke-start-button"
          onClick={() => void session.toggleSmoking()}
        >
          {session.smoking ? 'Stop Smoking' : 'Start Smoking'}
        </Button>
      </Grid>
      <Grid container direction="column">
        <Autocomplete
          sx={{ marginBottom: '10px' }}
          freeSolo
          options={woodType.map(option => option)}
          inputValue={session.woodType}
          onInputChange={(event, newInputValue) => session.setWoodType(newInputValue)}
          renderInput={params => (
            <Grid container direction="row" justifyContent="space-around">
              <TextField
                sx={{ marginTop: '10px', marginBottom: '10px', width: '95%' }}
                {...params}
                label="Wood Type"
                inputProps={{ ...params.inputProps, 'data-testid': 'smoke-wood-type-input' }}
              />
            </Grid>
          )}
        />
        <Grid container direction="row" justifyContent="space-around">
          <TextField
            sx={{ marginTop: '10px', marginBottom: '10px', width: '95%' }}
            id="outlined-multiline-static"
            label="Notes"
            multiline
            inputProps={{ 'data-testid': 'smoke-notes-input' }}
            value={session.notes}
            onChange={event => session.setNotes(event.target.value)}
            rows={4}
          />
        </Grid>
      </Grid>
      <Grid container className="buttonContainer" flexDirection="row-reverse">
        {props.nextButton}
      </Grid>
    </Grid>
  );
}

/**
 * Composition root for the web smoke session. Builds the monitor-role config
 * exactly once (via a ref so the cloud socket is opened a single time for the
 * step's lifetime), wires the cloud socket adapter and the session-API-port
 * adapter over the #344 client, and provides the store to the thin view below.
 *
 * This is the sole place the websocket URL is read: the env lookup lives here
 * and nowhere in the view.
 *
 * The composition root also owns the socket's teardown: {@link
 * SmokeSessionProvider} stops the store (detaching subscriptions) on unmount,
 * but only the host that opened the socket can close it. The unmount cleanup
 * calls {@link CloudSocketAdapter.close} so leaving the step disconnects the
 * socket.io connection instead of leaking a live connection per visit.
 */
export function SmokeStep(props: SmokeStepProps): JSX.Element {
  const configRef = useRef<SessionConfig | null>(null);
  const socketRef = useRef<CloudSocketAdapter | null>(null);
  if (configRef.current === null) {
    const url = process.env.WS_URL ?? '';
    const socket = createCloudSocketAdapter(url);
    socketRef.current = socket;
    configRef.current = {
      role: 'monitor',
      socket,
      api: createSessionApiPort(getDefaultApiClient()),
      clock: { now: () => new Date() },
    };
  }

  useEffect(() => {
    // Child effect cleanups (the Provider's store.stop()) run before this
    // parent cleanup, so subscriptions are detached before the socket closes.
    return () => {
      socketRef.current?.close();
    };
  }, []);

  return (
    <SmokeSessionProvider config={configRef.current}>
      <SmokeStepView nextButton={props.nextButton} />
    </SmokeSessionProvider>
  );
}
