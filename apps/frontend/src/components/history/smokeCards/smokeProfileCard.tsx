import { Card, CardContent, Grid, Typography } from '@mui/material';
import React from 'react';
import { SmokeProfile } from '../../../api/types';
import TempChart, { TempData } from 'temperaturechart/src/tempChart';
import { useChartColors } from '../../../theme';

interface SmokeProfileCardProps {
  smokeProfile: SmokeProfile;
  temps: TempData[];
}

export function SmokeProfileCard(props: SmokeProfileCardProps): JSX.Element {
  const chartColors = useChartColors();

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

          <TempChart
            ChamberTemp={
              props.temps.length > 0 ? props.temps[props.temps.length - 1].ChamberTemp : 0
            }
            MeatTemp={props.temps.length > 0 ? props.temps[props.temps.length - 1].MeatTemp : 0}
            Meat2Temp={props.temps.length > 0 ? props.temps[props.temps.length - 1].Meat2Temp : 0}
            Meat3Temp={props.temps.length > 0 ? props.temps[props.temps.length - 1].Meat3Temp : 0}
            ChamberName={props.smokeProfile.chamberName ?? 'Chamber'}
            Probe1Name={props.smokeProfile.probe1Name ?? 'Probe 1'}
            Probe2Name={props.smokeProfile.probe2Name ?? 'Probe 2'}
            Probe3Name={props.smokeProfile.probe3Name ?? 'Probe 3'}
            date={props.temps.length > 0 ? props.temps[props.temps.length - 1].date : new Date()}
            smoking={false}
            initData={props.temps}
            colors={chartColors}
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
