/**
 * The comparison: two cooks, from the plan through the cook to the verdict,
 * side by side.
 */
import { Box, Card, IconButton, Typography } from '@mui/material';
import React from 'react';
import { CompareStatus, useCompare } from '../../../api';
import { BackIcon, SwapIcon } from '../../common/components/DesignIcons';
import { useCompareSlotColors } from './compareColors';
import { CompareFactsTable } from './CompareFactsTable';
import { CompareNotesCard } from './CompareNotesCard';
import { CompareSlotCard } from './CompareSlotCard';
import { CompareSummaryCard } from './CompareSummaryCard';

/**
 * Where the two cooks' traces will be overlaid. The chart itself is a later
 * slice; the space it occupies is held here so the sections around it sit where
 * they will end up, rather than shuffling down the page when it lands.
 */
function CompareChartPlaceholder(): JSX.Element {
  return (
    <Card
      data-testid="compare-chart-placeholder"
      sx={theme => ({
        minHeight: 180,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        textAlign: 'center',
        fontSize: '0.8125rem',
        color: theme.design.textSecondary,
      })}
    >
      The temperature overlay lands here.
    </Card>
  );
}

/** Why there is no comparison on the screen, in the words of the reason. */
function Message({ status }: { status: CompareStatus }): JSX.Element | null {
  if (status === 'loading') {
    return null;
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
  /** Back to wherever the comparison was opened from. */
  onBack: () => void;
}

export function CompareScreen({ smokeIdA, smokeIdB, onBack }: CompareScreenProps): JSX.Element {
  const { a, b, status, swap } = useCompare(smokeIdA, smokeIdB);
  const colors = useCompareSlotColors();

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
          <CompareSlotCard side="A" cook={a} color={colors.a} />
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
          <CompareSlotCard side="B" cook={b} color={colors.b} />
        </Box>
      </Box>
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
          <CompareChartPlaceholder />
          <CompareFactsTable a={a} b={b} />
          <CompareNotesCard a={a} b={b} colors={colors} />
        </Box>
      ) : (
        // A comparison needs two cooks, and there are three reasons there may
        // not be two: nobody has chosen a second one (or logged one), a read is
        // still in flight, or a read failed. Each is said in its own words —
        // "log another cook" is wrong advice for a cook that failed to load.
        <Message status={status} />
      )}
    </Box>
  );
}
