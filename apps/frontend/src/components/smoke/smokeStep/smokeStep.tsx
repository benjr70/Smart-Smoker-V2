import React, { useRef } from 'react';
import Grid from '@mui/material/Grid';
import './smokeStep.style.css';
import { Autocomplete, Button, Divider, Input, TextField } from '@mui/material';
import TempChart from 'temperaturechart/src/tempChart';
import { SmokeSessionProvider, useSmokeSession } from 'smoke-session/src/react';
import { createCloudSocketAdapter, SessionConfig } from 'smoke-session/src';
import { getDefaultApiClient } from '../../../api';
import { createSessionApiPort } from '../../../api/sessionApiAdapter';

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

  return (
    <Grid item xs={12}>
      <Grid container direction="column" sx={{ marginTop: '10px' }}>
        <Grid
          container
          direction="row"
          justifyContent="space-around"
          sx={{ margin: '5px' }}
          color={'#1f4f2d'}
        >
          <Input
            defaultValue="Chamber"
            value={session.chamberName}
            onChange={event => session.setName('chamber', event.target.value)}
            sx={{ fontSize: 24, fontWeight: 700, color: '#1f4f2d', width: '75%' }}
            disableUnderline={true}
          />
          <Grid item className="text">
            {session.chamberTemp}
          </Grid>
        </Grid>
        <Divider variant="middle" />
        <Grid
          container
          direction="row"
          justifyContent="space-around"
          sx={{ margin: '5px' }}
          color={'#2a475e'}
        >
          <Input
            defaultValue="Probe 1"
            value={session.probe1Name}
            onChange={event => session.setName('probe1', event.target.value)}
            sx={{ fontSize: 24, fontWeight: 700, color: '#2a475e', width: '75%' }}
            disableUnderline={true}
          />
          <Grid item className="text">
            {session.probeTemp1}
          </Grid>
        </Grid>
        <Divider variant="middle" />
        <Grid
          container
          direction="row"
          justifyContent="space-around"
          sx={{ margin: '5px' }}
          color={'#118cd8'}
        >
          <Input
            defaultValue="Probe 2"
            value={session.probe2Name}
            onChange={event => session.setName('probe2', event.target.value)}
            sx={{ fontSize: 24, fontWeight: 700, color: '#118cd8', width: '75%' }}
            disableUnderline={true}
          />
          <Grid item className="text">
            {session.probeTemp2}
          </Grid>
        </Grid>
        <Divider variant="middle" />
        <Grid
          container
          direction="row"
          justifyContent="space-around"
          sx={{ margin: '5px' }}
          color={'#5582a7'}
        >
          <Input
            defaultValue="Probe 3"
            value={session.probe3Name}
            onChange={event => session.setName('probe3', event.target.value)}
            sx={{ fontSize: 24, fontWeight: 700, color: '#5582a7', width: '75%' }}
            disableUnderline={true}
          />
          <Grid item className="text">
            {session.probeTemp3}
          </Grid>
        </Grid>
      </Grid>
      <Grid item justifyContent="center" data-testid="smoke-chart">
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
      <Grid container className="buttonContainer" justifyContent="space-around">
        <Button
          className="button"
          variant="contained"
          size="small"
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
 */
export function SmokeStep(props: SmokeStepProps): JSX.Element {
  const configRef = useRef<SessionConfig | null>(null);
  if (configRef.current === null) {
    const url = process.env.WS_URL ?? '';
    configRef.current = {
      role: 'monitor',
      socket: createCloudSocketAdapter(url),
      api: createSessionApiPort(getDefaultApiClient()),
      clock: { now: () => new Date() },
    };
  }

  return (
    <SmokeSessionProvider config={configRef.current}>
      <SmokeStepView nextButton={props.nextButton} />
    </SmokeSessionProvider>
  );
}
