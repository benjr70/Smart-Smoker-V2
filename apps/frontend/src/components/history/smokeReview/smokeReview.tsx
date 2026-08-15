import { Box, Grid } from '@mui/material';
import React from 'react';
import { useReview } from '../../../api';
import { RatingsCard } from '../smokeCards/ratingsCard';
import { PostSmokeSection } from './PostSmokeSection';
import { PreSmokeSection } from './PreSmokeSection';
import { ReviewHeader } from './ReviewHeader';
import { SmokeSection } from './SmokeSection';

interface smokeReviewProps {
  smokeId: string;
}

/**
 * The history detail: one past cook read back as a story. A header saying
 * which cook, when it ran and how it scored, then the design's numbered
 * sections — 1 Pre-Smoke, 2 Smoke, 3 Post-Smoke — with the ratings below
 * them. Every piece the record does not hold reads as an em-dash inside the
 * section that would have shown it.
 */
export function SmokeReview(props: smokeReviewProps): JSX.Element {
  // One hook call resolves the whole aggregate (with defaults for absent
  // children) inside the client; the timeline rides along as null when the
  // backend could not derive one.
  const { preSmoke, date, timeline, smokeProfile, temps, postSmoke, rating } = useReview(
    props.smokeId
  );

  return (
    <Grid item xs={11}>
      <ReviewHeader
        name={preSmoke.name}
        date={date}
        startedAt={timeline?.startedAt ?? null}
        finishedAt={timeline?.finishedAt ?? null}
        overallRating={rating.overallTaste}
      />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <PreSmokeSection preSmoke={preSmoke} woodType={smokeProfile.woodType} />
        <SmokeSection smokeProfile={smokeProfile} temps={temps} timeline={timeline} />
        <PostSmokeSection postSmoke={postSmoke} />
        <RatingsCard ratings={rating} />
      </Box>
    </Grid>
  );
}
