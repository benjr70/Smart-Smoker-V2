import { Grid } from '@mui/material';
import React from 'react';
import { useReview } from '../../../api';
import { PreSmokeCard } from '../smokeCards/preSmokeCard';
import { SmokeProfileCard } from '../smokeCards/smokeProfileCard';
import { PostSmokeCard } from '../smokeCards/postSmokeCard';
import { RatingsCard } from '../smokeCards/ratingsCard';

interface smokeReviewProps {
  smokeId: string;
}

export function SmokeReview(props: smokeReviewProps): JSX.Element {
  // One hook call replaces the five useState blocks, five defaults blocks, and
  // the nested per-piece fetch waterfall this screen used to carry. The review
  // aggregate resolves every piece (with defaults for absent children) inside
  // the client.
  const { preSmoke, smokeProfile, temps, postSmoke, rating } = useReview(props.smokeId);

  return (
    <Grid item xs={11}>
      <PreSmokeCard preSmoke={preSmoke} />
      <SmokeProfileCard smokeProfile={smokeProfile} temps={temps} />
      <PostSmokeCard postSmoke={postSmoke} />
      <RatingsCard ratings={rating} />
    </Grid>
  );
}
