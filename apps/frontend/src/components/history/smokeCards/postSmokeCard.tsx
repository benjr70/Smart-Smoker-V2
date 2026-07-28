import { Card, CardContent, Grid, ThemeProvider, Typography, createTheme } from '@mui/material';
import React from 'react';
import { PostSmoke } from '../../../api/types';

interface preSmokeCardProps {
  postSmoke: PostSmoke;
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

export function PostSmokeCard(props: preSmokeCardProps): JSX.Element {
  return (
    <Grid paddingBottom={1}>
      <ThemeProvider theme={theme}>
        <Card>
          <CardContent>
            <Typography variant="h5" component="div" align={'center'}>
              PostSmoke
            </Typography>
            <Typography variant="h6" component="div" data-testid="review-postsmoke-resttime">
              Rest Time: {props.postSmoke.restTime}
            </Typography>
            {props.postSmoke.steps.map((step, index) => {
              return (
                <Typography
                  sx={{ fontSize: 18 }}
                  key={`post-smoker-card-${index}`}
                  data-testid="review-postsmoke-step"
                >
                  {index + 1}. {step}
                </Typography>
              );
            })}
            <Typography
              padding={1}
              sx={{ fontSize: 14 }}
              paragraph={true}
              color="text.secondary"
              data-testid="review-postsmoke-notes"
            >
              {props.postSmoke.notes}
            </Typography>
          </CardContent>
        </Card>
      </ThemeProvider>
    </Grid>
  );
}
