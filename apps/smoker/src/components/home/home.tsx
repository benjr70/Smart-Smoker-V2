import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import { Box, Button, Card, Divider, Typography } from '@mui/material';
import React, { useState } from 'react';
import TemperatureChart, { ChartSeriesNames } from 'temperaturechart/src/TemperatureChart';
import { ChartSample } from 'temperaturechart/src/chartGeometry';
import { useElapsed, useSmokeSession } from 'smoke-session/src/react';
import { DEFAULT_PROBE_NAMES } from 'smoke-session/src/session/domain';
import './home.style.css';
import { useChartPalette } from '../../theme/chartPalette';
import { useDesign } from '../../theme/useDesign';
import { CookCompletionEstimate } from '../../api';
import { CurrentCookReadPort, useCompletionEstimate } from './useCompletionEstimate';
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

/** Milliseconds in the units the window label is written in. */
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * What window of the cook the chart is showing, said as the design's label:
 * `LAST 3H 12M` over a drawn span, `LIVE` before there is one — the card
 * claims no span it does not show.
 */
const windowLabelOf = (series: ChartSample[]): string => {
  if (series.length < 2) {
    return 'LIVE';
  }
  const first = new Date(series[0].date).getTime();
  const last = new Date(series[series.length - 1].date).getTime();
  const span = last - first;
  if (!Number.isFinite(span) || span < MINUTE) {
    return 'LIVE';
  }
  const hours = Math.floor(span / HOUR);
  const minutes = Math.floor((span % HOUR) / MINUTE);
  if (hours === 0) {
    return `LAST ${minutes}M`;
  }
  return minutes === 0 ? `LAST ${hours}H` : `LAST ${hours}H ${minutes}M`;
};

/** The small upper-case caption the design labels its cards and clocks with. */
const overline = {
  fontSize: '0.6875rem',
  fontWeight: 700,
  letterSpacing: '0.12em',
  lineHeight: 1.3,
} as const;

/**
 * One probe of the list card: the dot and the name in the probe's own colour —
 * the same token the chart draws that probe's line in, which is the whole map
 * between the list and the graph beside it — and what it reads right now.
 */
interface ProbeRowProps {
  probe: 'probe1' | 'probe2' | 'probe3';
  name: string;
  value: string;
}

function ProbeRow({ probe, name, value }: ProbeRowProps): JSX.Element {
  const design = useDesign();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px' }}>
      {/* Decoration in the strict sense — the name beside it says everything
          it says — so it is not announced. */}
      <Box
        data-testid={`smoker-${probe}-dot`}
        aria-hidden="true"
        sx={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          flexShrink: 0,
          backgroundColor: design.probes[probe],
        }}
      />
      <Typography
        component="div"
        sx={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 18,
          fontWeight: 700,
          color: design.probes[probe],
        }}
      >
        {name}
      </Typography>
      <Typography
        component="div"
        data-testid={`smoker-${probe}-temp`}
        sx={{
          flexShrink: 0,
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1.1,
          // Numbers that do not shuffle sideways as they change: a reading
          // climbing from 99 to 100 should not move the rows around it.
          fontVariantNumeric: 'tabular-nums',
          color: design.probes[probe],
        }}
      >
        {value}
        {/* The unit is part of the reading, not a column heading, set small
            and in supporting ink — the one part of the number that never
            changes. Kept as its own element so the value beside it stays the
            bare reading for anything reading the row. */}
        <Box
          component="span"
          sx={{
            fontSize: 13,
            fontWeight: 600,
            marginLeft: '1px',
            color: design.textSecondary,
          }}
        >
          °F
        </Box>
      </Typography>
    </Box>
  );
}

/**
 * The smoker touchscreen home screen. A thin view over the shared session store
 * (smoker role): every temp, name, smoking flag, connectivity signal, and the
 * cook's recorded start come off the hook snapshot, and the two actions (toggle
 * smoking, navigate) dispatch store commands. All socket/serial wiring, offline
 * batching, and payload mapping live in the session store behind the Provider —
 * none of it in this component.
 *
 * The screen is the mock's 800×480 layout: a top bar (brand, state pill,
 * elapsed clock, wifi and start/stop), a left column with the chamber hero card
 * and the colour-coded probe list, and the titled chart card taking the rest.
 */
export interface HomeProps {
  /**
   * Where the configured targets are read from. Defaults to the settings this
   * appliance runs against; a screen assembled with its own reads whatever that
   * one says instead.
   */
  probeTargets?: ProbeTargetsReadPort;
  /**
   * Where the running cook — and the backend's estimate of when it will be
   * done — is read from. Defaults to the backend this appliance runs against.
   */
  currentCook?: CurrentCookReadPort;
}

/**
 * How long is left, in the compact hand the top bar has room for: `~12h 10m`.
 *
 * The same span the web card writes out as `~12h 10m remaining`, with the word
 * dropped — on a bar that already says ELAPSED beside a running clock, what a
 * second duration means is not in doubt, and the 800×480 panel has room for the
 * number rather than the sentence.
 */
const remainingIn = (hours: number): string => {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  return `~${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, '0')}m`;
};

/**
 * When the cook will be done, as the top bar says it: a clock time in the
 * reader's own locale and zone with how long that is away set beside it, and
 * nothing at all unless the backend says the cook is on track.
 *
 * The span is there because a clock time does not carry a day. A cook due at
 * 8:15 tomorrow morning reads exactly like one due in ten minutes, and the one
 * decision this readout exists to inform — whether to stay by the smoker — is
 * the one that gets made wrongly. It is left off when the backend has a moment
 * but cannot say how far away it is; the moment alone is still true.
 *
 * The other states are estimates the panel has nothing useful to say about — a
 * warming cook has no moment yet, a stalled or paused one has one nobody should
 * plan around, a done one has arrived — and this screen is read from across a
 * garage, where a caveat is not read at all. The web card, held in a hand, says
 * all of them in words.
 */
const etaReadout = (
  estimate: CookCompletionEstimate | null
): { at: string; away: string | null } | null =>
  estimate?.state === 'ok' && estimate.eta
    ? {
        at: estimate.eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        away: estimate.hoursRemaining === null ? null : remainingIn(estimate.hoursRemaining),
      }
    : null;

export function Home({ probeTargets, currentCook }: HomeProps = {}): JSX.Element {
  const session = useSmokeSession();
  const design = useDesign();
  // The cook so far, recorded and thinned by the hook; the chart is handed it
  // and draws it, and holds nothing of the cook itself.
  const series = useTemperatureSeries();
  const chartColors = useChartPalette();
  // What each meat is being cooked to, as the settings said when this panel was
  // switched on and when this cook was started; the chart rules a dashed line at
  // each one it is given.
  const chartTargets = useProbeTargets(session.smoking, probeTargets);
  // The cook's age, derived from the recorded stamp against the current time,
  // so the clock is right the instant the panel comes up — including a panel
  // restarted six hours into a cook.
  const elapsed = useElapsed(session.startedAt);
  // When the backend expects this cook to be done, re-read on its own cadence
  // while one is running — the same answer, off the same route, that the web
  // card is showing whoever is not standing at the smoker.
  const eta = etaReadout(useCompletionEstimate(session.smoking, currentCook));
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

  if (activeScreen !== 0) {
    return (
      <Box className="background">
        <Wifi onBack={goToScreen}></Wifi>
      </Box>
    );
  }

  return (
    <Box
      className="background"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        height: '100vh',
        boxSizing: 'border-box',
        padding: '10px 12px 12px',
      }}
    >
      {/* ————— Top bar ————— */}
      <Box component="header" sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Typography
          component="h1"
          sx={{
            ...overline,
            fontSize: '0.9375rem',
            color: design.text,
            whiteSpace: 'nowrap',
          }}
        >
          SMART SMOKER
        </Typography>
        {/* The state as a pill, in words rather than colour alone; the colour
            (and the glow while smoking) only reinforce them, and the attribute
            is what a test reads it by. */}
        <Box
          data-testid="smoker-status-pill"
          data-smoking={String(session.smoking)}
          sx={{
            ...overline,
            padding: '4px 12px',
            borderRadius: '999px',
            whiteSpace: 'nowrap',
            color: session.smoking ? design.success : design.textSecondary,
            border: `1px solid ${session.smoking ? design.success : design.border}`,
            boxShadow: session.smoking ? `0 0 10px 0 ${design.success}` : 'none',
          }}
        >
          {session.smoking ? 'SMOKING' : 'IDLE'}
        </Box>
        {/* The clock counts only a running cook; an idle panel says why there
            is nothing to count rather than showing a zero that could be a cook
            about to be one hour old. */}
        {session.smoking ? (
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '6px', whiteSpace: 'nowrap' }}>
            <Typography component="span" sx={{ ...overline, color: design.textSecondary }}>
              ELAPSED
            </Typography>
            <Typography
              component="span"
              data-testid="smoker-elapsed-clock"
              sx={{
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 700,
                fontSize: 18,
                color: design.text,
              }}
            >
              {elapsed}
            </Typography>
            {/* When it will be done, set beside how long it has been going and
                in the same hand — one more reading of the same cook, not a
                card. It appears only while the backend says the cook is on
                track, so a moment on this screen is always one to plan around;
                every other state simply leaves the bar as it was. */}
            {eta !== null && (
              <>
                <Typography
                  component="span"
                  sx={{ ...overline, marginLeft: '8px', color: design.textSecondary }}
                >
                  ETA
                </Typography>
                <Typography
                  component="span"
                  data-testid="smoker-eta"
                  sx={{
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 700,
                    fontSize: 18,
                    color: design.text,
                  }}
                >
                  {eta.at}
                </Typography>
                {/* How far away that is, in the quieter ink the labels are in:
                    a clock time carries no day, and this is what tells a cook
                    due overnight from one due before the beer is finished. */}
                {eta.away !== null && (
                  <Typography
                    component="span"
                    data-testid="smoker-eta-remaining"
                    sx={{
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: 14,
                      color: design.textSecondary,
                    }}
                  >
                    {eta.away}
                  </Typography>
                )}
              </>
            )}
          </Box>
        ) : (
          <Typography component="span" sx={{ fontSize: 14, color: design.textSecondary }}>
            No active smoke
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Button
          className="wifiButton"
          variant="outlined"
          size="small"
          aria-label={session.wifiConnected ? 'wifi connected' : 'wifi disconnected'}
          onClick={() => goToScreen(1)}
          sx={{
            minWidth: 0,
            borderColor: design.border,
            // The glyph carries the answer: green for a device on the network,
            // red for one off it — the two colours the design says those
            // things in everywhere else.
            color: session.wifiConnected ? design.success : design.danger,
          }}
        >
          {session.wifiConnected ? <WifiIcon /> : <WifiOffIcon />}
        </Button>
        {/* Two states, two appearances. Lighting a cook is what the screen is
            for, so it is offered filled in the accent; putting one out is
            destructive and unrepeatable, so it retreats to an outline in the
            danger colour — present, unmissable, and not the thing a thumb
            presses by habit. */}
        <Button
          className="button"
          variant={session.smoking ? 'outlined' : 'contained'}
          color={session.smoking ? 'error' : 'primary'}
          size="small"
          data-testid="smoker-start-button"
          sx={session.smoking ? { borderColor: design.danger, color: design.danger } : {}}
          onClick={() => void session.toggleSmoking()}
        >
          {session.smoking ? 'Stop Smoking' : 'Start Smoking'}
        </Button>
      </Box>

      {/* ————— Cards ————— */}
      <Box sx={{ display: 'flex', gap: '10px', flex: 1, minHeight: 0 }}>
        {/* Left column: the chamber said once and large, then the meats. */}
        <Box
          sx={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '38%', minWidth: 0 }}
        >
          <Card data-testid="smoker-chamber-card" sx={{ padding: '12px 14px' }}>
            <Typography
              component="div"
              sx={{ fontSize: 18, fontWeight: 700, color: design.probes.chamber }}
            >
              {session.chamberName}
            </Typography>
            <Typography
              component="div"
              data-testid="smoker-chamber-temp"
              sx={{
                fontSize: 56,
                fontWeight: 700,
                lineHeight: 1.05,
                fontVariantNumeric: 'tabular-nums',
                color: design.text,
              }}
            >
              {session.chamberTemp}
              <Box
                component="span"
                sx={{
                  fontSize: 20,
                  fontWeight: 600,
                  marginLeft: '2px',
                  color: design.textSecondary,
                }}
              >
                °F
              </Box>
            </Typography>
          </Card>
          <Card data-testid="smoker-probe-card" sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <ProbeRow probe="probe1" name={session.probe1Name} value={session.probeTemp1} />
            <Divider />
            <ProbeRow probe="probe2" name={session.probe2Name} value={session.probeTemp2} />
            <Divider />
            <ProbeRow probe="probe3" name={session.probe3Name} value={session.probeTemp3} />
          </Card>
        </Box>

        {/* The chart in its card, saying what the picture is of and over how
            long. The legend is the chart's own, drawn under the plot: the key
            and the lines it names stay in one card. */}
        <Card
          data-testid="smoker-chart-card"
          sx={{ flex: 1, minWidth: 0, padding: '10px 14px 6px' }}
        >
          <Box sx={{ display: 'flex', alignItems: 'baseline', marginBottom: '4px' }}>
            <Typography component="h2" sx={{ ...overline, color: design.textSecondary, flex: 1 }}>
              TEMPERATURE HISTORY
            </Typography>
            <Typography
              component="span"
              data-testid="smoker-chart-window"
              sx={{ ...overline, color: design.textSecondary }}
            >
              {windowLabelOf(series)}
            </Typography>
          </Box>
          <TemperatureChart
            data={series}
            names={chartNamesOf(session)}
            colors={chartColors}
            targets={chartTargets}
            aspect="touchscreen"
          />
        </Card>
      </Box>
    </Box>
  );
}
