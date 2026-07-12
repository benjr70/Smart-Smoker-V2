import {
  Card,
  CardContent,
  Grid,
  Rating,
  ThemeProvider,
  Typography,
  createTheme,
} from '@mui/material';
import React, { useEffect, useState } from 'react';
import { rating } from '../../common/interfaces/rating';
import { updateRatings } from '../../../Services/ratingsService';

interface RatingsCardProps {
  ratings: rating;
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

export function RatingsCard(props: RatingsCardProps): JSX.Element {
  const [ratings, setRatings] = useState<rating>(props.ratings);

  useEffect(() => {
    setRatings(props.ratings);
  }, [props.ratings]);

  useEffect(() => {
    if (ratings._id) {
      updateRatings(ratings);
    }
  }, [ratings]);

  return (
    <Grid>
      <ThemeProvider theme={theme}>
        <Card>
          <CardContent>
            <Typography variant="h5" component="div" align={'center'}>
              Ratings
            </Typography>
            <Typography component="legend">Smoke Flavor: {ratings.smokeFlavor}</Typography>
            <Rating
              name="size-large"
              defaultValue={5}
              size="large"
              max={10}
              value={ratings.smokeFlavor}
              onChange={event => {
                setRatings({
                  ...ratings,
                  smokeFlavor: parseFloat((event.target as HTMLInputElement).value),
                });
              }}
            />
            <Typography component="legend">Seasoning: {ratings.seasoning}</Typography>
            <Rating
              name="size-large"
              defaultValue={5}
              size="large"
              max={10}
              value={ratings.seasoning}
              onChange={event => {
                setRatings({
                  ...ratings,
                  seasoning: parseFloat((event.target as HTMLInputElement).value),
                });
              }}
            />
            <Typography component="legend">Tenderness: {ratings.tenderness}</Typography>
            <Rating
              name="size-large"
              defaultValue={5}
              size="large"
              max={10}
              value={ratings.tenderness}
              onChange={event => {
                setRatings({
                  ...ratings,
                  tenderness: parseFloat((event.target as HTMLInputElement).value),
                });
              }}
            />
            <Typography component="legend" data-testid="review-rating-overallTaste-value">
              Overall Taste: {ratings.overallTaste}
            </Typography>
            <span data-testid="review-rating-overallTaste">
              <Rating
                name="size-large"
                defaultValue={5}
                size="large"
                max={10}
                value={ratings.overallTaste}
                onChange={event => {
                  setRatings({
                    ...ratings,
                    overallTaste: parseFloat((event.target as HTMLInputElement).value),
                  });
                }}
              />
            </span>
          </CardContent>
        </Card>
      </ThemeProvider>
    </Grid>
  );
}
