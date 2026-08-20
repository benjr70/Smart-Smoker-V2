import '@testing-library/jest-dom';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Stats } from '../../api';
import { DesignSurface, appTheme } from '../../theme';
import { StatsContent } from './StatsContent';

/**
 * The screen under the application's own theme, in both schemes: every surface
 * on it is painted from a design token, and a token read off a bare Material-UI
 * theme is `undefined` — which renders, silently, as no card at all.
 */
const renderStats = (stats: Stats, mode: 'light' | 'dark' = 'light') =>
  render(
    <CssVarsProvider theme={appTheme} defaultMode={mode}>
      <DesignSurface>
        <StatsContent stats={stats} />
      </DesignSurface>
    </CssVarsProvider>
  );

const EMPTY: Stats = {
  totalSessions: 0,
  totalCookMs: null,
  totalPounds: null,
  approximateServings: null,
  averageRating: null,
  averageCookMs: null,
  totalRestMs: null,
  woodTypeCount: 0,
  meatTypeCount: 0,
  records: {
    highestRated: null,
    longestCook: null,
    heaviestCut: null,
    hottestChamber: null,
  },
  byMeat: [],
  byWood: [],
  categoryAverages: {
    smokeFlavor: null,
    seasoning: null,
    tenderness: null,
    overallTaste: null,
  },
};

const HOUR = 60 * 60 * 1000;

const archive: Stats = {
  ...EMPTY,
  totalSessions: 14,
  totalCookMs: 128 * HOUR + 30 * 60 * 1000,
  totalPounds: 412.4,
  approximateServings: 1031,
  averageRating: 8.6,
  averageCookMs: 9 * HOUR + 10 * 60 * 1000,
  totalRestMs: 21 * HOUR,
  woodTypeCount: 5,
  meatTypeCount: 7,
};

describe('the Stats screen', () => {
  test('leads with the time smoked and the meat that went through the smoker', () => {
    renderStats(archive);

    expect(screen.getByTestId('stat-total-time')).toHaveTextContent('128h 30m');
    expect(screen.getByTestId('stat-total-time')).toHaveTextContent('14 sessions');
    expect(screen.getByTestId('stat-total-meat')).toHaveTextContent('412.4 lbs');
    expect(screen.getByTestId('stat-total-meat')).toHaveTextContent('1,031 servings');
  });

  test('shows the six figures of the secondary grid', () => {
    renderStats(archive);

    expect(screen.getByTestId('stat-sessions')).toHaveTextContent('14');
    expect(screen.getByTestId('stat-average-rating')).toHaveTextContent('8.6');
    expect(screen.getByTestId('stat-average-cook')).toHaveTextContent('9h 10m');
    expect(screen.getByTestId('stat-total-rest')).toHaveTextContent('21h 00m');
    expect(screen.getByTestId('stat-wood-types')).toHaveTextContent('5');
    expect(screen.getByTestId('stat-meat-types')).toHaveTextContent('7');
  });

  test('admits a figure it does not have rather than printing a zero', () => {
    renderStats({ ...archive, averageRating: null, totalRestMs: null });

    expect(screen.getByTestId('stat-average-rating')).toHaveTextContent('—');
    expect(screen.getByTestId('stat-total-rest')).toHaveTextContent('—');
  });

  test('greets a user who has never finished a cook instead of showing them zeros', () => {
    renderStats(EMPTY);

    expect(screen.getByTestId('stats-empty')).toBeInTheDocument();
    expect(screen.getByText('No stats yet')).toBeInTheDocument();
    expect(screen.queryByTestId('stat-total-time')).not.toBeInTheDocument();
  });

  test('does not claim a servings count for an archive with no weights on record', () => {
    renderStats({ ...archive, totalPounds: null, approximateServings: null });

    expect(screen.getByTestId('stat-total-meat')).toHaveTextContent('—');
    expect(screen.getByTestId('stat-total-meat')).not.toHaveTextContent('servings');
  });

  test('paints itself out of the theme in dark mode too', () => {
    renderStats(archive, 'dark');

    expect(screen.getByTestId('stat-total-time')).toBeInTheDocument();
    expect(screen.getByTestId('stats-grid')).toBeInTheDocument();
  });
});
