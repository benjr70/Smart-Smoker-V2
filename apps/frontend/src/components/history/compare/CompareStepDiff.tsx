/**
 * What the two cooks did, as a diff rather than as two lists.
 *
 * Two step lists printed side by side leave the comparing to the pitmaster; the
 * question is what was done differently, so the shared steps collapse into a
 * muted group and each cook's own steps stand out in that cook's colour.
 *
 * One card serves both method sections — pre-smoke leads with the wood, post-
 * smoke with the rest — because the sections differ only in which figure heads
 * them and which steps and notes are being diffed.
 */
import { Box, Card } from '@mui/material';
import React from 'react';
import { CompareSlotColors } from './compareColors';
import { diffSteps } from './compareSteps';

export interface CompareStepDiffProps {
  /** What the card is called in the DOM, so a section can be found by name. */
  testId: string;
  /** The section's number, as the design badges it. */
  section: string;
  /** The section's name, e.g. `PRE-SMOKE`. */
  title: string;
  /** The one figure the section turns on, e.g. `Wood` or `Rest`. */
  headlineLabel: string;
  /** That figure for each cook, already written the way its section writes it. */
  headlineA: string;
  headlineB: string;
  /** Each cook's steps for this section, as they were written. */
  aSteps: string[];
  bSteps: string[];
  /** Each cook's note for this section, if it wrote one. */
  aNotes?: string;
  bNotes?: string;
  colors: CompareSlotColors;
}

interface GroupProps {
  testId: string;
  label: string;
  items: string[];
  /** The colour that means the cook these steps belong to; absent for shared steps. */
  color?: string;
}

/**
 * One band of the diff. Steps both cooks did are drawn in the quiet colour with
 * hollow bullets — they are context, not findings — and an empty band is not
 * drawn at all rather than left as a heading over nothing.
 */
function Group({ testId, label, items, color }: GroupProps): JSX.Element | null {
  if (items.length === 0) return null;
  const shared = color === undefined;

  return (
    <Box data-testid={testId} sx={{ marginTop: '12px' }}>
      <Box
        component="span"
        data-testid="compare-diff-group-label"
        sx={theme => ({
          display: 'block',
          fontSize: '0.6875rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
          marginBottom: '6px',
          color: shared ? theme.design.textSecondary : color,
        })}
      >
        {label}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {/* Keyed by position: a cook that logged the same step twice has two
            rows here, and they are two rows the list never reorders. */}
        {items.map((step, index) => (
          <Box
            key={`${index}-${step}`}
            sx={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}
          >
            <Box
              component="span"
              aria-hidden="true"
              data-testid="compare-diff-bullet"
              sx={theme => ({
                width: 5,
                height: 5,
                borderRadius: '50%',
                flexShrink: 0,
                marginTop: '6px',
                backgroundColor: shared ? theme.design.border : color,
              })}
            />
            <Box
              component="span"
              sx={theme => ({
                fontSize: '0.8125rem',
                lineHeight: 1.45,
                color: shared ? theme.design.textSecondary : theme.design.text,
              })}
            >
              {step}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export function CompareStepDiff({
  testId,
  section,
  title,
  headlineLabel,
  headlineA,
  headlineB,
  aSteps,
  bSteps,
  aNotes,
  bNotes,
  colors,
}: CompareStepDiffProps): JSX.Element {
  const { both, onlyA, onlyB } = diffSteps(aSteps, bSteps);
  // Colour here means "these two differ", so it is spent only where they do.
  // Two cooks that used the same wood, or rested the same length, made no
  // choice worth colouring; neither do two the record is silent about — a pair
  // of em-dashes shouted in each cook's colour is the loudest treatment on the
  // card given to the least informative row it can hold. Greying an absence is
  // not a claim that the cooks matched, which is why the facts table still
  // refuses to call two em-dashes the `same` fact; it is only a refusal to
  // claim they differed.
  const differentHeadline = headlineA !== headlineB;
  const notes = [
    { side: 'A' as const, note: aNotes?.trim(), color: colors.a },
    { side: 'B' as const, note: bNotes?.trim(), color: colors.b },
  ].filter(row => Boolean(row.note));

  return (
    <Card data-testid={testId} sx={{ padding: '14px 16px 16px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
        <Box
          component="span"
          aria-hidden="true"
          sx={theme => ({
            width: 22,
            height: 22,
            borderRadius: '7px',
            flexShrink: 0,
            backgroundColor: theme.design.surfaceAlt,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.75rem',
            fontWeight: 800,
            color: theme.design.textSecondary,
          })}
        >
          {section}
        </Box>
        <Box
          component="span"
          sx={theme => ({
            fontSize: '0.6875rem',
            fontWeight: 600,
            letterSpacing: '0.05em',
            color: theme.design.textSecondary,
          })}
        >
          {title}
        </Box>
      </Box>

      <Box
        data-testid="compare-diff-headline"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginTop: '12px',
          paddingBottom: '2px',
        }}
      >
        <Box
          component="span"
          sx={theme => ({
            flex: 1,
            fontSize: '0.75rem',
            fontWeight: 600,
            color: theme.design.textSecondary,
          })}
        >
          {headlineLabel}
        </Box>
        {(
          [
            ['a', headlineA, colors.a],
            ['b', headlineB, colors.b],
          ] as const
        ).map(([side, value, color], index) => (
          <React.Fragment key={side}>
            {index === 1 && (
              <Box
                component="span"
                aria-hidden="true"
                sx={theme => ({ fontSize: '0.75rem', color: theme.design.textSecondary })}
              >
                /
              </Box>
            )}
            <Box
              component="span"
              data-testid={`compare-diff-headline-${side}`}
              sx={theme => ({
                fontSize: '0.875rem',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: differentHeadline ? color : theme.design.textSecondary,
              })}
            >
              {value}
            </Box>
          </React.Fragment>
        ))}
      </Box>

      <Group testId="compare-diff-same" label={`SAME IN BOTH · ${both.length}`} items={both} />
      <Group testId="compare-diff-only-a" label="ONLY COOK A" items={onlyA} color={colors.a} />
      <Group testId="compare-diff-only-b" label="ONLY COOK B" items={onlyB} color={colors.b} />
      {onlyA.length === 0 && onlyB.length === 0 && (
        // An empty diff is a finding of its own — two cooks that were prepared
        // identically — and saying so is the difference between "no differences"
        // and a card that failed to draw. But it is only that finding when
        // there were steps to match: two cooks that logged nothing were not
        // prepared the same way, they were prepared unwatched, and the card
        // says which of the two it is looking at.
        <Box
          data-testid={both.length > 0 ? 'compare-diff-identical' : 'compare-diff-no-steps'}
          sx={theme => ({
            fontSize: '0.75rem',
            marginTop: '10px',
            color: theme.design.textSecondary,
          })}
        >
          {both.length > 0
            ? 'Identical steps in both cooks.'
            : 'Neither cook recorded any steps here.'}
        </Box>
      )}

      {notes.length > 0 && (
        <Box
          data-testid="compare-diff-notes"
          sx={theme => ({
            marginTop: '14px',
            paddingTop: '12px',
            borderTop: `1px solid ${theme.design.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '9px',
          })}
        >
          {notes.map(row => (
            <Box key={row.side} sx={{ display: 'flex', gap: '10px' }}>
              <Box
                component="span"
                data-testid={`compare-diff-note-prefix-${row.side.toLowerCase()}`}
                sx={{
                  width: 16,
                  flexShrink: 0,
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  color: row.color,
                }}
              >
                {row.side}
              </Box>
              <Box
                component="span"
                data-testid={`compare-diff-note-${row.side.toLowerCase()}`}
                sx={theme => ({
                  flex: 1,
                  fontSize: '0.8125rem',
                  lineHeight: 1.5,
                  color: theme.design.text,
                })}
              >
                {row.note}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Card>
  );
}
