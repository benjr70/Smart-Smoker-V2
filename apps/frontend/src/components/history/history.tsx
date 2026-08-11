import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import { Box, Grid, IconButton } from '@mui/material';
import React, { useMemo, useState } from 'react';
import { useHistory } from '../../api';
import { ConfirmSheet } from '../common/components/ConfirmSheet';
import { HistoryEmpty } from './HistoryEmpty';
import { HistoryHeader } from './HistoryHeader';
import './history.style.css';
import { selectHistory } from './historyQuery';
import { SmokeCard } from './smokeCards/SmokeCard';
import { SmokeReview } from './smokeReview/smokeReview';

export function History(): JSX.Element {
  // The list, its newest-first reversal, refresh, and the cascade delete all
  // live in the hook now; a failed fetch yields an empty list plus the failure
  // snackbar instead of crashing on the old unguarded `result.reverse()`.
  const { history, refresh, remove } = useHistory();
  const [smokeId, setSmokeId] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [meats, setMeats] = useState<string[]>([]);
  // The cook the confirmation sheet is asking about, if it is up.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | undefined>(undefined);

  // What is searched and how it narrows the list is the query module's; the
  // screen holds only what the user typed and chose.
  const { shown, filtering, meatTypes, emptyState } = useMemo(
    () => selectHistory(history, { query, meats }),
    [history, query, meats]
  );

  const onClearFilters = () => {
    setQuery('');
    setMeats([]);
  };

  const onToggleMeat = (meat: string) => {
    setMeats(chosen =>
      chosen.includes(meat) ? chosen.filter(other => other !== meat) : [...chosen, meat]
    );
  };

  const onViewClick = (id: string) => {
    setSmokeId(id);
  };

  const onBackClick = async () => {
    setSmokeId(undefined);
    await refresh();
  };

  // Nothing is deleted until the sheet is answered: the trash asks, and the
  // sheet's own confirming button is the only thing that calls the API.
  const pendingDelete = history.find(smoke => smoke.smokeId === pendingDeleteId);

  const onConfirmDelete = async () => {
    const id = pendingDeleteId;
    setPendingDeleteId(undefined);
    if (id !== undefined) {
      await remove(id);
    }
  };

  return (
    <Box className="history" data-testid="history-screen">
      {smokeId ? (
        <Grid paddingLeft={2} paddingTop={1}>
          <IconButton color="primary" component="label" onClick={onBackClick}>
            <ArrowBackIosIcon />
          </IconButton>
        </Grid>
      ) : (
        <HistoryHeader
          total={history.length}
          showing={shown.length}
          filtering={filtering}
          query={query}
          onQueryChange={setQuery}
          meatTypes={meatTypes}
          meats={meats}
          onToggleMeat={onToggleMeat}
          onClearMeats={() => setMeats([])}
        />
      )}
      {/* The gap below the last card is the list's own rhythm now — it matches
          the spacing between the cards. It used to be the bar's height over
          again, to keep the last card clear of the bar; the bar reserves that
          itself now (BOTTOM_BAR_HEIGHT in bottombar.tsx), directly below this
          screen, so holding it here as well only doubles the dead space. */}
      <Box
        sx={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px 16px 16px' }}
        data-testid="history-cards"
      >
        {smokeId ? (
          <SmokeReview smokeId={smokeId} />
        ) : emptyState ? (
          <HistoryEmpty state={emptyState} onClearFilters={onClearFilters} />
        ) : (
          shown.map(smokeHistory => (
            <SmokeCard
              key={smokeHistory.smokeId}
              smoke={smokeHistory}
              onViewClick={onViewClick}
              onDeleteClick={setPendingDeleteId}
            />
          ))
        )}
      </Box>
      <ConfirmSheet
        open={pendingDelete !== undefined}
        title="Delete this smoke?"
        confirmLabel="Delete smoke"
        cancelLabel="Keep it"
        onConfirm={onConfirmDelete}
        onCancel={() => setPendingDeleteId(undefined)}
        testId="delete-smoke-sheet"
      >
        <strong>{pendingDelete?.name}</strong> from {pendingDelete?.date} will be removed, along
        with its temperature log, notes, and ratings. This can’t be undone.
      </ConfirmSheet>
    </Box>
  );
}
