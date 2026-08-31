import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import { Box, Grid, IconButton } from '@mui/material';
import React, { useMemo, useState } from 'react';
import { useHistory } from '../../api';
import { ConfirmSheet } from '../common/components/ConfirmSheet';
import { CompareScreen } from './compare/CompareScreen';
import { HistoryEmpty, HistoryEmptyKind } from './HistoryEmpty';
import { HistoryHeader } from './HistoryHeader';
import './history.style.css';
import { selectHistory } from './historyQuery';
import { SmokeCard } from './smokeCards/SmokeCard';
import { SmokeReview } from './smokeReview/smokeReview';

export function History(): JSX.Element {
  // The list, its newest-first reversal, refresh, and the cascade delete all
  // live in the hook now; a failed fetch yields an empty list plus the failure
  // snackbar instead of crashing on the old unguarded `result.reverse()`.
  const { history, status, refresh, remove } = useHistory();
  const [smokeId, setSmokeId] = useState<string | undefined>(undefined);
  // The two cooks being compared, when a comparison is open. Compare is a third
  // view of this screen rather than a place of its own — no router — and it sits
  // *over* whichever of the other two is open, so leaving it restores where it
  // was opened from without this screen having to remember where that was.
  // The B slot may be empty: a cook opened from its own page can be the only
  // cook there is, and the comparison says so rather than the page pretending
  // the control was never offered.
  const [compared, setCompared] = useState<{ a: string; b?: string } | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [meats, setMeats] = useState<string[]>([]);
  // The cook the confirmation sheet is asking about, if it is up.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | undefined>(undefined);

  // What is searched and how it narrows the list is the query module's; the
  // screen holds only what the user typed and chose. `chosenMeats` comes back
  // reconciled against the list — a meat whose last cook has been deleted has
  // no chip left to unpick it, so it stops narrowing — and it, not the raw
  // state, is what the chips are drawn from.
  const {
    shown,
    filtering,
    meatTypes,
    meats: chosenMeats,
    emptyState,
  } = useMemo(() => selectHistory(history, { query, meats }), [history, query, meats]);

  // An empty list means nothing until the read is over. A failed read says so
  // and offers another go; a read still in flight says nothing at all, because
  // "no smokes logged yet" is a claim about the user's history and nobody has
  // been told what it holds yet. Only once it has landed does the query
  // module's answer — no cooks at all, or none matching — get to speak.
  const listEmptyState: HistoryEmptyKind | null =
    status === 'failed' ? 'load-failed' : status === 'loading' ? null : emptyState;

  const onClearFilters = () => {
    setQuery('');
    setMeats([]);
  };

  // Toggling works from the reconciled choice rather than the raw one, so a
  // meat the list has since lost is dropped for good the next time the chips
  // are touched instead of lying in wait.
  const onToggleMeat = (meat: string) => {
    setMeats(
      chosenMeats.includes(meat)
        ? chosenMeats.filter(other => other !== meat)
        : [...chosenMeats, meat]
    );
  };

  const onViewClick = (id: string) => {
    setSmokeId(id);
  };

  // Opened from the list, a comparison starts on the two most recent cooks the
  // list is *showing* — the comparison a pitmaster is most likely to have come
  // for, and never two cooks a filter has taken off their screen.
  const onCompareFromList = () => {
    const a = shown[0]?.smokeId;
    const b = shown[1]?.smokeId;
    if (a !== undefined) {
      setCompared({ a, b });
    }
  };

  // Opened from a cook's own page, that cook is A and the most recent other
  // cook is B. The whole archive is what B is drawn from here, not the filtered
  // list: the detail view shows no filter, so narrowing one down on the list
  // and then opening a cook is not a statement about what to compare it with.
  // A cook with nothing to be held against still opens the comparison, which
  // says what it would take to have one.
  const onCompareFromDetail = (viewed: string) => {
    setCompared({ a: viewed, b: history.find(smoke => smoke.smokeId !== viewed)?.smokeId });
  };

  // The list's own control is offered against what is on the screen: a filter
  // narrowed to one cook has no pair to compare, whatever the archive holds.
  const onCompareShown = shown.length > 1 ? onCompareFromList : undefined;

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

  // The comparison takes the whole screen: the list's header and the detail's
  // back row both belong to the view underneath it, which is still there,
  // untouched, when it closes.
  if (compared !== undefined) {
    return (
      <Box className="history" data-testid="history-screen">
        <CompareScreen
          smokeIdA={compared.a}
          smokeIdB={compared.b}
          // The whole archive, not the filtered list: which two cooks the
          // comparison *opens* on comes from what is on the screen, but what it
          // can be re-aimed at is everything ever cooked — a search made before
          // opening it is not a statement about what may be compared.
          cooks={history}
          onBack={() => setCompared(undefined)}
        />
      </Box>
    );
  }

  return (
    <Box className="history" data-testid="history-screen">
      {smokeId ? (
        <Grid
          paddingLeft={2}
          paddingTop={1}
          paddingRight={2}
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <IconButton aria-label="Back" color="primary" component="label" onClick={onBackClick}>
            <ArrowBackIosIcon />
          </IconButton>
          {/* Always offered: comparing is about the cook on the screen, and a
              cook with nothing to be held against is told so by the comparison
              rather than by a control that quietly is not there. */}
          <Box
            component="button"
            type="button"
            onClick={() => onCompareFromDetail(smokeId)}
            sx={theme => ({
              height: 44,
              padding: '0 16px',
              borderRadius: '11px',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: theme.design.text,
              backgroundColor: theme.design.surface,
              border: `1.5px solid ${theme.design.border}`,
            })}
          >
            Compare
          </Box>
        </Grid>
      ) : (
        <HistoryHeader
          total={history.length}
          showing={shown.length}
          filtering={filtering}
          query={query}
          onQueryChange={setQuery}
          meatTypes={meatTypes}
          meats={chosenMeats}
          onToggleMeat={onToggleMeat}
          onClearMeats={() => setMeats([])}
          onCompare={onCompareShown}
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
        ) : listEmptyState ? (
          <HistoryEmpty state={listEmptyState} onClearFilters={onClearFilters} onRetry={refresh} />
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
