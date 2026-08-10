import React, { useEffect, useRef } from 'react';
import Grid from '@mui/material/Grid';
import './smokeStep.style.css';
import { Autocomplete, Button, Card, Divider, TextField, Typography } from '@mui/material';
import TemperatureChart from 'temperaturechart/src/TemperatureChart';
import { SmokeSessionProvider, useSmokeSession } from 'smoke-session/src/react';
import { CloudSocketAdapter, createCloudSocketAdapter, SessionConfig } from 'smoke-session/src';
import { getDefaultApiClient, useCookStart } from '../../../api';
import { createSessionApiPort } from '../../../api/sessionApiAdapter';
import { useChartPalette } from '../../../theme';
import { chartNamesOf } from '../../common/chartNames';
import { SmokeStatusBar } from './SmokeStatusBar';
import { TemperatureChannel, TemperatureRow } from './TemperatureRow';
import { useProbeTargets } from './useProbeTargets';
import { useTemperatureSeries } from './useTemperatureSeries';

/**
 * The woods the picker offers, in the design's order. Mesquite joins the five
 * the app has always listed — it is one of the four or five woods anyone
 * actually smokes on, and its absence was an omission rather than a decision.
 *
 * The list is a set of suggestions, not the permitted values: the picker is
 * free-text, so a cook on grapevine or whisky-barrel oak is recorded the same
 * way as one on hickory.
 */
const WOOD_TYPES = ['Hickory', 'Post Oak', 'Pecan', 'Cherry', 'Apple', 'Mesquite'];

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
 *
 * What the step *looks* like is the design's: a column of cards — the readings,
 * the chart under its own heading, and the wood and notes the cook is described
 * with — with the status bar above them and the control that lights the cook
 * between the chart and the description. There is deliberately no Estimated
 * Completion card: target temperatures stay settings-managed, and the design's
 * estimate is the one part of this screen the product is not building.
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

  /**
   * The four readings in the order the design lists them, each paired with the
   * session field it comes from. Written out once so the card below is a list
   * rather than four copies of the same markup differing only in which probe
   * they name — which is what the previous four hand-written blocks were.
   */
  const readings: {
    channel: TemperatureChannel;
    name: string;
    placeholder: string;
    value: string;
  }[] = [
    {
      channel: 'chamber',
      name: session.chamberName,
      placeholder: 'Chamber',
      value: session.chamberTemp,
    },
    {
      channel: 'probe1',
      name: session.probe1Name,
      placeholder: 'Probe 1',
      value: session.probeTemp1,
    },
    {
      channel: 'probe2',
      name: session.probe2Name,
      placeholder: 'Probe 2',
      value: session.probeTemp2,
    },
    {
      channel: 'probe3',
      name: session.probe3Name,
      placeholder: 'Probe 3',
      value: session.probeTemp3,
    },
  ];

  return (
    // The step is one column of cards down the screen — status, readings,
    // chart, the control that lights the cook, and the notes it is described
    // with. Every gap between them is the column's, so the cards themselves
    // carry no margins and none of them has to know what it is next to.
    <Grid item xs={12} sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <SmokeStatusBar smoking={session.smoking} startedAt={startedAt} />
      <Card data-testid="smoke-temps-card">
        {readings.map((reading, index) => (
          <React.Fragment key={reading.channel}>
            {/* Between the readings only: the card's own border already ends
                the list at both ends, and a rule on top of it would read as a
                double line. */}
            {index > 0 ? <Divider /> : null}
            <TemperatureRow
              channel={reading.channel}
              name={reading.name}
              placeholder={reading.placeholder}
              value={reading.value}
              onNameChange={name => session.setName(reading.channel, name)}
            />
          </React.Fragment>
        ))}
      </Card>
      <Card data-testid="smoke-chart-card" sx={{ padding: '12px 14px 8px' }}>
        {/* The plot is a picture of numbers; nothing in it says which numbers,
            or over what. The design gives it a heading, set as an overline
            rather than a title so it labels the card without competing with the
            readings above it. */}
        <Typography
          component="h2"
          sx={theme => ({
            fontSize: '0.6875rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            lineHeight: 1.3,
            color: theme.design.textSecondary,
            marginBottom: '6px',
          })}
        >
          TEMPERATURE HISTORY
        </Typography>
        {/* The legend is the chart's own, drawn under the plot: the key and the
            lines it names stay in one card, and this step does not build a
            second one out of the same names. */}
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
      </Card>
      <Grid container justifyContent="space-around">
        {/* Two states, two appearances. Lighting a cook is what the screen is
            for, so it is offered filled in the accent; putting one out is
            destructive and unrepeatable, so it retreats to an outline in the
            danger colour — present, unmissable, and not the thing a thumb
            reaches for by default. */}
        <Button
          className="button"
          variant={session.smoking ? 'outlined' : 'contained'}
          color={session.smoking ? 'error' : 'primary'}
          size="small"
          data-testid="smoke-start-button"
          // Material-UI draws an outlined button's border at half the strength
          // of its text. The design's stop control is outlined in the danger
          // colour itself, so the border is stated rather than left to that
          // default.
          sx={theme => (session.smoking ? { borderColor: theme.design.danger } : {})}
          onClick={() => void session.toggleSmoking()}
        >
          {session.smoking ? 'Stop Smoking' : 'Start Smoking'}
        </Button>
      </Grid>
      <Card data-testid="smoke-details-card" sx={{ padding: '14px' }}>
        {/* The picker keeps its type-anything behaviour and gains the look of
            the design's select: the list is always offered behind a chevron,
            rather than Material-UI's free-text default of hiding it. A cook on
            a wood nobody listed is still recordable — which is the whole reason
            this is not a real select. */}
        <Autocomplete
          freeSolo
          forcePopupIcon
          options={WOOD_TYPES}
          inputValue={session.woodType}
          onInputChange={(event, newInputValue) => session.setWoodType(newInputValue)}
          renderInput={params => (
            <TextField
              {...params}
              fullWidth
              label="Wood Type"
              inputProps={{ ...params.inputProps, 'data-testid': 'smoke-wood-type-input' }}
            />
          )}
        />
        <TextField
          sx={{ marginTop: '14px' }}
          fullWidth
          id="outlined-multiline-static"
          label="Notes"
          placeholder="How is the cook going?"
          multiline
          inputProps={{ 'data-testid': 'smoke-notes-input' }}
          value={session.notes}
          onChange={event => session.setNotes(event.target.value)}
          rows={4}
        />
      </Card>
      <Grid container flexDirection="row-reverse" sx={{ paddingBottom: '8px' }}>
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
