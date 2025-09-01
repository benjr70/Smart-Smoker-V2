import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import { Grid, IconButton } from '@mui/material';
import React, { useEffect, useState } from 'react';
import { deleteSmoke } from '../../Services/deleteSmokeService';
import { getSmokeHistory } from '../../Services/smokerService';
import { smokeHistory } from '../common/interfaces/history';
import './history.style.css';
import { SmokeCard } from './smokeCards/smokeCard';
import { SmokeReview } from './smokeReview/smokeReview';

interface historyInterface {
  smokeHistoryList: smokeHistory[];
  smokeId?: string;
}

export function History(): JSX.Element {
  const [history, setHistory] = useState<historyInterface>({
    smokeHistoryList: [],
    smokeId: undefined,
  });

  useEffect(() => {
    getSmokeHistory().then((result: smokeHistory[]) => {
      const temp: historyInterface = {
        smokeHistoryList: result.reverse(),
        smokeId: undefined,
      };
      setHistory(temp);
    });
  }, []);

  const onViewClick = (smokeId: string) => {
    setHistory(prevHistory => ({
      smokeHistoryList: prevHistory.smokeHistoryList,
      smokeId: smokeId,
    }));
  };

  const onBackClick = async () => {
    setHistory(prevHistory => ({
      smokeHistoryList: prevHistory.smokeHistoryList,
      smokeId: undefined,
    }));
    await updateList();
  };

  const onDeleteClick = async (smokeId: string) => {
    await deleteSmoke(smokeId);
    await updateList();
  };

  const updateList = async () => {
    await getSmokeHistory().then((result: smokeHistory[]) => {
      setHistory(() => ({
        smokeHistoryList: result.reverse(),
        smokeId: undefined,
      }));
    });
  };

  return (
    <Grid paddingTop={1} className="history">
      {history.smokeId ? (
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
        {!history.smokeId ? (
          history.smokeHistoryList.map((smokeHistory, index) => {
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
          <SmokeReview smokeId={history.smokeId} />
        )}
      </Grid>
    </Grid>
  );
}
