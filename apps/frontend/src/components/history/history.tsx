import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import { Grid, IconButton } from '@mui/material';
import React, { useState } from 'react';
import { useHistory } from '../../api';
import './history.style.css';
import { SmokeCard } from './smokeCards/smokeCard';
import { SmokeReview } from './smokeReview/smokeReview';

export function History(): JSX.Element {
  // The list, its newest-first reversal, refresh, and the cascade delete all
  // live in the hook now; a failed fetch yields an empty list plus the failure
  // snackbar instead of crashing on the old unguarded `result.reverse()`.
  const { history, refresh, remove } = useHistory();
  const [smokeId, setSmokeId] = useState<string | undefined>(undefined);

  const onViewClick = (id: string) => {
    setSmokeId(id);
  };

  const onBackClick = async () => {
    setSmokeId(undefined);
    await refresh();
  };

  const onDeleteClick = async (id: string) => {
    await remove(id);
  };

  return (
    <Grid paddingTop={1} className="history">
      {smokeId ? (
        <Grid paddingLeft={2}>
          <IconButton color="primary" component="label" onClick={onBackClick}>
            <ArrowBackIosIcon />
          </IconButton>
        </Grid>
      ) : (
        <></>
      )}
      <Grid
        container
        spacing={2}
        sx={{ display: 'flex', justifyContent: 'center' }}
        paddingBottom={8}
      >
        {!smokeId ? (
          history.map((smokeHistory, index) => {
            return (
              <Grid item xs={11} key={`smoke-card-${index}`}>
                <SmokeCard
                  name={smokeHistory.name}
                  meatType={smokeHistory.meatType}
                  date={smokeHistory.date}
                  weight={smokeHistory.weight}
                  overAllRatings={smokeHistory.overAllRating}
                  weightUnit={smokeHistory.weightUnit}
                  woodType={smokeHistory.woodType}
                  smokeId={smokeHistory.smokeId}
                  onViewClick={onViewClick}
                  onDeleteClick={onDeleteClick}
                />
              </Grid>
            );
          })
        ) : (
          <SmokeReview smokeId={smokeId} />
        )}
      </Grid>
    </Grid>
  );
}
