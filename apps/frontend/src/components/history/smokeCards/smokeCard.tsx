import {
  Button,
  Card,
  CardActions,
  CardContent,
  Grid,
  Rating,
  ThemeProvider,
  Typography,
  createTheme,
} from '@mui/material';
import React from 'react';

interface SmokeCardProps {
  name: string;
  meatType: string;
  date: string;
  weight: string;
  weightUnit: string;
  smokeId: string;
  woodType: string;
  overAllRatings: string;
  onViewClick: (smokeId: string) => void;
  onDeleteClick: (smokeId: string) => void;
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

export function SmokeCard(props: SmokeCardProps): JSX.Element {
  return (
    <Grid>
      <ThemeProvider theme={theme}>
        <Card>
          <CardContent>
            <Typography variant="h5" component="div">
              {props.name}
            </Typography>
            <Typography sx={{ fontSize: 14 }} color="text.secondary">
              {props.weight}
              {props.weightUnit} {props.meatType} {props.woodType} wood
            </Typography>
            <Typography sx={{ fontSize: 14 }} color="text.secondary">
              {props.date}
            </Typography>
            <Rating
              name="size-large"
              defaultValue={parseFloat(props.overAllRatings)}
              size="large"
              max={10}
              value={parseFloat(props.overAllRatings)}
            />
            <CardActions sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button size="small" onClick={() => props.onViewClick(props.smokeId)}>
                View
              </Button>
              <Button size="small" color="error" onClick={() => props.onDeleteClick(props.smokeId)}>
                delete
              </Button>
            </CardActions>
          </CardContent>
        </Card>
      </ThemeProvider>
    </Grid>
  );
}
