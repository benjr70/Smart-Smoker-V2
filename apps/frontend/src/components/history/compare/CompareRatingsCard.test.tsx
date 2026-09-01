/**
 * The outcome, axis by axis: what each cook scored, which one won that axis and
 * by how much.
 *
 * Rendered directly with two ratings, because everything worth asserting here
 * is about the pair of scores — the wording of a row, which way the arrow
 * points, when a difference is too small to be worth colouring, and how tall a
 * bar a score draws.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { rating } from '../../../api';
import { DesignSurface, appTheme, carbonLight } from '../../../theme';
import { CompareRatingsCard } from './CompareRatingsCard';

const colors = { a: carbonLight.probes.probe2, b: carbonLight.probes.chamber };

const scored = (overrides: Partial<rating> = {}): rating => ({
  smokeFlavor: 8,
  seasoning: 7,
  tenderness: 9,
  overallTaste: 8.5,
  notes: '',
  ...overrides,
});

const renderRatings = (a: rating, b: rating) =>
  render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <CompareRatingsCard a={a} b={b} colors={colors} />
      </DesignSurface>
    </CssVarsProvider>
  );

/** The row for one axis, found by the axis it scores. */
const axisRow = (axis: string): HTMLElement =>
  // eslint-disable-next-line testing-library/no-node-access
  screen.getByTestId('compare-ratings').querySelector(`[data-axis="${axis}"]`) as HTMLElement;

describe('CompareRatingsCard', () => {
  test('scores both cooks on each of the four axes', () => {
    renderRatings(scored(), scored({ smokeFlavor: 6, tenderness: 5, overallTaste: 6 }));

    expect(
      screen.getAllByTestId('compare-rating-row').map(row => row.getAttribute('data-axis'))
    ).toEqual(['Smoke flavor', 'Seasoning', 'Tenderness', 'Overall taste']);
    expect(within(axisRow('Smoke flavor')).getByTestId('compare-rating-values')).toHaveTextContent(
      '8.0 · 6.0'
    );
    expect(within(axisRow('Overall taste')).getByTestId('compare-rating-values')).toHaveTextContent(
      '8.5 · 6.0'
    );
  });

  test('the delta points at the cook that won the axis, in that cook’s colour', () => {
    renderRatings(
      scored({ smokeFlavor: 8, seasoning: 5 }),
      scored({ smokeFlavor: 6, seasoning: 7 })
    );

    const smoke = within(axisRow('Smoke flavor'));
    expect(smoke.getByTestId('compare-rating-delta')).toHaveTextContent('▲2.0');
    expect(smoke.getByTestId('compare-rating-values')).toHaveStyle({
      color: carbonLight.probes.probe2,
    });

    const seasoning = within(axisRow('Seasoning'));
    expect(seasoning.getByTestId('compare-rating-delta')).toHaveTextContent('▼2.0');
    expect(seasoning.getByTestId('compare-rating-values')).toHaveStyle({
      color: carbonLight.probes.chamber,
    });
  });

  /**
   * A tenth of a point apart on a ten-point scale is two cooks that scored the
   * same; colouring it would claim a win nobody would taste. The scores
   * themselves carry that — there is no arrow left to grey.
   */
  test('a difference too small to matter is greyed', () => {
    renderRatings(scored({ tenderness: 9 }), scored({ tenderness: 9.04 }));

    const row = within(axisRow('Tenderness'));
    const values = row.getByTestId('compare-rating-values');
    expect(values).toHaveTextContent('9.0 · 9.0');
    expect(values).toHaveStyle({ color: carbonLight.textSecondary });
    expect(row.queryByTestId('compare-rating-delta')).toBeNull();
  });

  test('two cooks that scored an axis identically get no arrow', () => {
    renderRatings(scored({ seasoning: 7 }), scored({ seasoning: 7 }));

    const row = within(axisRow('Seasoning'));
    expect(row.getByTestId('compare-rating-values')).toHaveStyle({
      color: carbonLight.textSecondary,
    });
    expect(row.queryByTestId('compare-rating-delta')).toBeNull();
  });

  /** A hair over the threshold is a difference, and is coloured as one. */
  test('a difference just over the threshold counts', () => {
    renderRatings(scored({ tenderness: 9 }), scored({ tenderness: 8.95 }));

    const row = within(axisRow('Tenderness'));
    expect(row.getByTestId('compare-rating-delta')).toHaveTextContent('▲0.1');
    expect(row.getByTestId('compare-rating-values')).toHaveStyle({
      color: carbonLight.probes.probe2,
    });
  });

  /**
   * The bars are the row read at a glance: A above B, each filled against the
   * ten points the axis is scored out of, in that cook's colour.
   */
  test('stacks A over B on the ten-point scale, each in its colour', () => {
    renderRatings(scored({ smokeFlavor: 8 }), scored({ smokeFlavor: 5 }));

    const row = axisRow('Smoke flavor');
    const barA = within(row).getByTestId('compare-rating-bar-a');
    const barB = within(row).getByTestId('compare-rating-bar-b');
    expect(barA).toHaveStyle({ width: '80%', backgroundColor: carbonLight.probes.probe2 });
    expect(barB).toHaveStyle({ width: '50%', backgroundColor: carbonLight.probes.chamber });
    // A's bar is drawn above B's, so colour and position agree everywhere.
    expect(barA.compareDocumentPosition(barB) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /**
   * A zero is a slider nobody moved, not the worst cook ever made — the same
   * reading the summary card and the archive's statistics give it. Scoring it
   * 0.0 would hand the other cook a win by the whole scale on an axis nobody
   * ever tasted.
   */
  test('an axis nobody scored is written as absent, not as a zero', () => {
    renderRatings(scored({ tenderness: 0 }), scored({ tenderness: 10 }));

    const row = within(axisRow('Tenderness'));
    expect(row.getByTestId('compare-rating-values')).toHaveTextContent('— · 10.0');
    expect(row.queryByTestId('compare-rating-delta')).toBeNull();
    expect(row.getByTestId('compare-rating-values')).toHaveStyle({
      color: carbonLight.textSecondary,
    });
    expect(row.getByTestId('compare-rating-bar-a')).toHaveStyle({ width: '0%' });
    expect(row.getByTestId('compare-rating-bar-b')).toHaveStyle({ width: '100%' });
  });

  /**
   * A cook archived without opening the ratings screen has no ratings document
   * at all and reads back as zeros on every axis. It is not the loser of every
   * axis by eight points — it was never in the comparison, which is exactly
   * what the summary card above says about the same pair.
   */
  test('a cook nobody rated loses no axis', () => {
    const unrated: rating = {
      smokeFlavor: 0,
      seasoning: 0,
      tenderness: 0,
      overallTaste: 0,
      notes: '',
    };
    renderRatings(unrated, scored());

    screen.getAllByTestId('compare-rating-row').forEach(row => {
      expect(within(row).queryByTestId('compare-rating-delta')).toBeNull();
      expect(within(row).getByTestId('compare-rating-values')).toHaveStyle({
        color: carbonLight.textSecondary,
      });
      expect(within(row).getByTestId('compare-rating-bar-a')).toHaveStyle({ width: '0%' });
    });
  });

  /** A score beyond the scale still fills the bar rather than overflowing it. */
  test('a score past the top of the scale fills the bar and no more', () => {
    renderRatings(scored({ seasoning: 12 }), scored({ seasoning: 4 }));

    const row = axisRow('Seasoning');
    expect(within(row).getByTestId('compare-rating-bar-a')).toHaveStyle({ width: '100%' });
    expect(within(row).getByTestId('compare-rating-bar-b')).toHaveStyle({ width: '40%' });
  });
});
