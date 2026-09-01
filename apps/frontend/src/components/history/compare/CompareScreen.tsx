/**
 * The comparison: two cooks, from the plan through the cook to the verdict,
 * side by side.
 */
import { Box, CircularProgress, IconButton, Typography } from '@mui/material';
import React, { useEffect, useState } from 'react';
import type { SeriesKey } from 'temperaturechart/src/chartGeometry';
import { DEFAULT_POSITIONS } from 'temperaturechart/src/compareGeometry';
import { CompareStatus, useCompare } from '../../../api';
import { SmokeHistory } from '../../../api/types';
import { BackIcon, SwapIcon } from '../../common/components/DesignIcons';
import { useCompareSlotColors } from './compareColors';
import { CompareChartCard } from './CompareChartCard';
import { CompareFactsTable } from './CompareFactsTable';
import { CompareNotesCard } from './CompareNotesCard';
import { CompareSlotCard } from './CompareSlotCard';
import { CompareSummaryCard } from './CompareSummaryCard';
import { CookPickerSheet } from './CookPickerSheet';

/** Why there is no comparison on the screen, in the words of the reason. */
function Message({ status }: { status: CompareStatus }): JSX.Element {
  if (status === 'loading') {
    // A read in flight says so out loud rather than leaving the page blank: a
    // comparison that is coming and one that is broken look identical to a
    // pitmaster on a slow link, and only one of them is worth waiting through.
    return (
      <Box
        data-testid="compare-loading"
        sx={theme => ({
          padding: '48px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '14px',
          fontSize: '0.875rem',
          color: theme.design.textSecondary,
        })}
      >
        <CircularProgress size={26} aria-hidden="true" />
        Reading both cooks…
      </Box>
    );
  }
  const failed = status === 'failed';
  return (
    <Box
      data-testid={failed ? 'compare-failed' : 'compare-empty'}
      sx={theme => ({
        padding: '48px 24px',
        textAlign: 'center',
        fontSize: '0.875rem',
        color: theme.design.textSecondary,
      })}
    >
      {failed ? 'Could not load these cooks.' : 'Log at least two cooks to compare them.'}
    </Box>
  );
}

export interface CompareScreenProps {
  /** The cook the A slot starts on. */
  smokeIdA?: string;
  /** The cook the B slot starts on. */
  smokeIdB?: string;
  /**
   * Every cook that can be compared, newest first — what the picker offers.
   *
   * Handed down from the history screen, which has already read it, rather than
   * read again here: the comparison is a third view of that screen, and asking
   * the backend for the same archive a second time to fill a sheet the user may
   * never open would be a read for nothing.
   */
  cooks?: readonly SmokeHistory[];
  /** Back to wherever the comparison was opened from. */
  onBack: () => void;
}

export function CompareScreen({
  smokeIdA,
  smokeIdB,
  cooks = [],
  onBack,
}: CompareScreenProps): JSX.Element {
  // Which two cooks are being compared is the screen's own, seeded by where the
  // comparison was opened from: the picker re-aims it from here, and the
  // history screen underneath keeps saying where it started.
  const [chosen, setChosen] = useState<{ a?: string; b?: string }>({ a: smokeIdA, b: smokeIdB });
  // Which slot the picker is filling, or `null` while it is closed.
  const [picking, setPicking] = useState<'A' | 'B' | null>(null);

  useEffect(() => {
    setChosen({ a: smokeIdA, b: smokeIdB });
  }, [smokeIdA, smokeIdB]);

  const { a, b, idA, idB, status, swap } = useCompare(chosen.a, chosen.b);
  const colors = useCompareSlotColors();

  // Which probes the overlay is showing belongs to the screen rather than to
  // the chart: it is a question about the pair being compared, so a new pair —
  // picked, or swapped into the other slot — is asked afresh rather than
  // inheriting the last pair's chips, which may have been chosen for probes
  // neither of these cooks ran.
  const [positions, setPositions] = useState<readonly SeriesKey[]>(DEFAULT_POSITIONS);
  useEffect(() => {
    setPositions(DEFAULT_POSITIONS);
  }, [idA, idB]);

  /**
   * The cook chosen for a slot goes into the slot that was pressed.
   *
   * The pair is recorded in the order it is on the screen — which, after a
   * swap, is not the order it was asked for — so that a pick fills the slot the
   * pitmaster pressed rather than the one whose cook has since moved out of it.
   */
  const pick = (side: 'A' | 'B', smokeId: string): void => {
    if ((side === 'A' ? idA : idB) === smokeId) {
      return;
    }
    setChosen({ a: side === 'A' ? smokeId : idA, b: side === 'B' ? smokeId : idB });
  };

  return (
    <Box data-testid="compare-screen">
      {/* Sticky, like the history header it replaces: the slot cards are what
          every colour further down the page means, so they stay in view while
          the sections scroll past them. */}
      <Box
        component="header"
        sx={theme => ({
          position: 'sticky',
          top: 0,
          zIndex: theme.zIndex.appBar,
          backgroundColor: theme.design.background,
          borderBottom: `1px solid ${theme.design.border}`,
          padding: '16px 16px 12px',
        })}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <IconButton
            aria-label="Back"
            onClick={onBack}
            sx={theme => ({
              width: 44,
              height: 44,
              marginLeft: '-10px',
              borderRadius: '11px',
              color: theme.design.text,
            })}
          >
            <BackIcon size={20} />
          </IconButton>
          <Box>
            <Typography
              component="p"
              sx={theme => ({
                fontSize: '0.6875rem',
                fontWeight: 600,
                letterSpacing: '0.14em',
                lineHeight: 1.3,
                color: theme.design.textSecondary,
              })}
            >
              SMART SMOKER
            </Typography>
            <Typography
              component="h1"
              sx={theme => ({
                fontSize: '1.25rem',
                fontWeight: 800,
                lineHeight: 1.2,
                color: theme.design.text,
              })}
            >
              Compare cooks
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CompareSlotCard
            side="A"
            cook={a}
            color={colors.a}
            loading={status === 'loading'}
            onPick={() => setPicking('A')}
          />
          <IconButton
            aria-label="Swap cooks"
            onClick={swap}
            sx={theme => ({
              width: 44,
              height: 44,
              flexShrink: 0,
              borderRadius: '12px',
              backgroundColor: theme.design.inputBg,
              border: `1.5px solid ${theme.design.inputBorder}`,
              color: theme.design.text,
            })}
          >
            <SwapIcon size={17} />
          </IconButton>
          <CompareSlotCard
            side="B"
            cook={b}
            color={colors.b}
            loading={status === 'loading'}
            onPick={() => setPicking('B')}
          />
        </Box>
      </Box>
      {/* The picker only exists while a slot is asking: mounting it on demand
          is what makes each opening a fresh question, with no search text or
          chips left over from the last cook that was chosen. */}
      {picking !== null && (
        <CookPickerSheet
          open
          side={picking}
          cooks={cooks}
          selectedId={picking === 'A' ? idA : idB}
          otherId={picking === 'A' ? idB : idA}
          onPick={smokeId => pick(picking, smokeId)}
          onClose={() => setPicking(null)}
        />
      )}
      {a !== null && b !== null ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '12px 16px 16px',
          }}
        >
          <CompareSummaryCard a={a} b={b} colors={colors} />
          <CompareChartCard
            a={a}
            b={b}
            colors={colors}
            positions={positions}
            onPositionsChange={setPositions}
          />
          <CompareFactsTable a={a} b={b} />
          <CompareNotesCard a={a} b={b} colors={colors} />
        </Box>
      ) : (
        // A comparison needs two cooks, and there are three reasons there may
        // not be two on the screen: nobody has logged a second one, a read is
        // still in flight, or a read failed. Each is said in its own words —
        // "log another cook" is wrong advice for a cook that failed to load,
        // and both are wrong for one that is simply still on its way.
        <Message status={status} />
      )}
    </Box>
  );
}
