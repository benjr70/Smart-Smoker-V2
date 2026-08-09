import { Card, CardContent, Grid, Typography } from '@mui/material';
import React, { useMemo } from 'react';
import { SmokeProfile } from '../../../api/types';
import { TempData } from 'temperaturechart/src/tempChart';
import TemperatureChart from 'temperaturechart/src/TemperatureChart';
import { decimate } from 'temperaturechart/src/chartGeometry';
import { useChartPalette } from '../../../theme';
import { chartNamesOf } from '../../common/chartNames';

interface SmokeProfileCardProps {
  smokeProfile: SmokeProfile;
  temps: TempData[];
}

export function SmokeProfileCard(props: SmokeProfileCardProps): JSX.Element {
  const chartColors = useChartPalette();
  // A finished cook is every reading it ever took — twelve hours of them for a
  // brisket — and the card is the smallest chart in the app. It is thinned to
  // what that chart can draw, once, rather than on every render of the review.
  const cook = useMemo(() => decimate(props.temps), [props.temps]);

  return (
    <Grid paddingBottom={1}>
      <Card data-testid="review-smoke-card">
        <CardContent>
          <Typography variant="h5" component="div" align={'center'}>
            Smoke
          </Typography>
          <Typography
            sx={{
              fontSize: 18,
              fontWeight: 700,
              width: '75%',
            }}
          >
            Probes
          </Typography>
          {/* Each probe name is painted in its own probe's colour, from the
              scheme in effect — the same colours the chart below draws that
              probe's line in, so a name and its line match in either scheme.
              They are set large and bold because that is the size their colours
              are chosen to be readable at: two of the light ones are chart
              colours first, and do not clear the threshold for small text on a
              white card. */}
          <Typography
            sx={theme => ({
              fontSize: 20,
              fontWeight: 700,
              color: theme.design.probes.chamber,
              width: '75%',
            })}
            data-testid="review-smoke-chambername"
          >
            {props.smokeProfile.chamberName ?? 'Chamber'}
          </Typography>
          <Typography
            sx={theme => ({
              fontSize: 20,
              fontWeight: 700,
              color: theme.design.probes.probe1,
              width: '75%',
            })}
            data-testid="review-smoke-probe1name"
          >
            {props.smokeProfile.probe1Name ?? 'Probe 1'}
          </Typography>
          <Typography
            sx={theme => ({
              fontSize: 20,
              fontWeight: 700,
              color: theme.design.probes.probe2,
              width: '75%',
            })}
            data-testid="review-smoke-probe2name"
          >
            {props.smokeProfile.probe2Name ?? 'Probe 2'}
          </Typography>
          <Typography
            sx={theme => ({
              fontSize: 20,
              fontWeight: 700,
              color: theme.design.probes.probe3,
              width: '75%',
            })}
            data-testid="review-smoke-probe3name"
          >
            {props.smokeProfile.probe3Name ?? 'Probe 3'}
          </Typography>

          {/* The cook as it was recorded, in the shape the card has room for.
              No target is drawn across it: a smoke being read back is over, and
              a line saying where it was headed is only noise on it. */}
          <TemperatureChart
            data={cook}
            names={chartNamesOf(props.smokeProfile)}
            colors={chartColors}
            aspect="compact"
          />
          <Typography sx={{ fontSize: 18 }} data-testid="review-smoke-woodtype">
            {props.smokeProfile.woodType} Wood
          </Typography>
          <Typography
            padding={1}
            sx={{ fontSize: 14 }}
            paragraph={true}
            color="text.secondary"
            data-testid="review-smoke-notes"
          >
            {props.smokeProfile.notes}
          </Typography>
        </CardContent>
      </Card>
    </Grid>
  );
}
