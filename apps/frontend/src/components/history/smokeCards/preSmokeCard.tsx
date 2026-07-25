import { Card, CardContent, Grid, ThemeProvider, Typography, createTheme } from '@mui/material';
import React from 'react';
import { PreSmoke } from '../../../api/types';

interface preSmokeCardProps {
  preSmoke: PreSmoke;
}

const theme = createTheme({
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: 'white',
          borderRadius: '15px',
        },
      },
    },
  },
});

export function PreSmokeCard(props: preSmokeCardProps): JSX.Element {
  return (
    <Grid paddingBottom={1}>
      <ThemeProvider theme={theme}>
        <Card>
          <CardContent>
            <Typography variant="h5" component="div" align={'center'}>
              PreSmoke
            </Typography>
            <Typography variant="h5" component="div" data-testid="review-presmoke-name">
              {props.preSmoke.name}
            </Typography>
            <Typography
              sx={{ fontSize: 14 }}
              paddingBottom={1}
              color="text.secondary"
              data-testid="review-presmoke-details"
            >
              {props.preSmoke.meatType} {props.preSmoke.weight.weight} {props.preSmoke.weight.unit}
            </Typography>
            {props.preSmoke.steps.map((step, index) => {
              return (
                <Typography sx={{ fontSize: 18 }} key={`pre-smoker-card-${index}`}>
                  {index + 1}. {step}
                </Typography>
              );
            })}
            <Typography padding={1} sx={{ fontSize: 14 }} paragraph={true} color="text.secondary">
              {props.preSmoke.notes}
            </Typography>
          </CardContent>
        </Card>
      </ThemeProvider>
    </Grid>
  );
}
