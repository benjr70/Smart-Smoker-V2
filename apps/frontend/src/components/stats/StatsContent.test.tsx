import '@testing-library/jest-dom';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import { render, screen, within } from '@testing-library/react';
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
  records: {
    highestRated: {
      smokeId: 'smoke-1',
      label: 'Sunday brisket',
      date: '2026-04-20T12:00:00.000Z',
      value: 9.4,
    },
    longestCook: {
      smokeId: 'smoke-2',
      label: 'Overnight pork butt',
      date: '2026-03-02T12:00:00.000Z',
      value: 14 * HOUR + 20 * 60 * 1000,
    },
    heaviestCut: {
      smokeId: 'smoke-3',
      label: 'Packer brisket',
      date: '2026-02-14T12:00:00.000Z',
      value: 18.5,
    },
    hottestChamber: {
      smokeId: 'smoke-4',
      label: 'Hot and fast ribs',
      date: '2026-01-09T12:00:00.000Z',
      value: 287.4,
    },
  },
  byMeat: [
    { meatType: 'Brisket', sessions: 6, pounds: 84.5 },
    { meatType: 'Pork butt', sessions: 3, pounds: 24 },
    { meatType: 'Ribs', sessions: 1, pounds: 4.5 },
  ],
  byWood: [
    { woodType: 'Hickory', sessions: 8 },
    { woodType: 'Apple', sessions: 1 },
  ],
  categoryAverages: {
    smokeFlavor: 8.25,
    seasoning: 7,
    tenderness: 9.4,
    overallTaste: 8.6,
  },
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
    // The greeting replaces the screen, not just its headline: an archive with
    // nothing in it has no records, no breakdowns and no scores either.
    expect(screen.queryByTestId('stats-records')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stats-by-meat')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stats-by-wood')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stats-scores')).not.toBeInTheDocument();
  });

  test('does not claim a servings count for an archive with no weights on record', () => {
    renderStats({ ...archive, totalPounds: null, approximateServings: null });

    expect(screen.getByTestId('stat-total-meat')).toHaveTextContent('—');
    expect(screen.getByTestId('stat-total-meat')).not.toHaveTextContent('servings');
  });

  test('celebrates the four cooks that hold the records', () => {
    renderStats(archive);

    const highest = screen.getByTestId('stat-record-highest-rated');
    expect(highest).toHaveTextContent('Highest rated');
    expect(highest).toHaveTextContent('Sunday brisket');
    expect(highest).toHaveTextContent('9.4 / 10');

    expect(screen.getByTestId('stat-record-longest-cook')).toHaveTextContent('14h 20m');
    expect(screen.getByTestId('stat-record-longest-cook')).toHaveTextContent('Overnight pork butt');
    expect(screen.getByTestId('stat-record-heaviest-cut')).toHaveTextContent('18.5 lbs');
    expect(screen.getByTestId('stat-record-hottest-chamber')).toHaveTextContent('287°F');
  });

  test('holds a place for a record no cook has set yet', () => {
    // Nothing stamped a chamber peak until this release, so an archive of older
    // cooks genuinely has no hottest chamber. The row still says what the record
    // is — dropping it would read as though the app had forgotten the category.
    renderStats({ ...archive, records: { ...archive.records, hottestChamber: null } });

    const row = screen.getByTestId('stat-record-hottest-chamber');
    expect(row).toHaveTextContent('Hottest chamber');
    expect(row).toHaveTextContent('—');
    expect(row).not.toHaveTextContent('°F');
  });

  test('ranks the meats by how often they have been cooked, longest bar first', () => {
    renderStats({
      ...archive,
      // Out of order on the wire: the ranking is what the section is for, so the
      // screen puts them in it rather than trusting the order it was handed.
      byMeat: [
        { meatType: 'Ribs', sessions: 1, pounds: 4.5 },
        { meatType: 'Brisket', sessions: 6, pounds: 84.5 },
        { meatType: 'Pork butt', sessions: 3, pounds: 24 },
      ],
    });

    const rows = screen.getAllByTestId('stat-meat-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Brisket');
    expect(rows[0]).toHaveTextContent('6 sessions');
    expect(rows[0]).toHaveTextContent('84.5 lbs');
    expect(rows[1]).toHaveTextContent('Pork butt');
    expect(rows[2]).toHaveTextContent('Ribs');
    expect(rows[2]).toHaveTextContent('1 session');

    // The bars are read against each other: the most-cooked meat fills its row
    // and everything else is a fraction of it.
    expect(within(rows[0]).getByTestId('stat-bar-fill')).toHaveStyle({ width: '100%' });
    expect(within(rows[1]).getByTestId('stat-bar-fill')).toHaveStyle({ width: '50%' });
    expect(within(rows[2]).getByTestId('stat-bar-fill')).toHaveStyle({ width: '16.7%' });
  });

  test('does not credit a weight to meats nobody weighed', () => {
    // Weight is optional on a cook, so a meat can have been smoked three times
    // with nothing entered for any of them. The backend sums that to zero, and
    // `0 lbs` would state a weight the archive never recorded — the same claim
    // the hero card refuses to make when it says "no weights on record".
    renderStats({
      ...archive,
      byMeat: [{ meatType: 'Brisket', sessions: 3, pounds: 0 }],
    });

    const row = screen.getByTestId('stat-meat-row');
    expect(row).toHaveTextContent('3 sessions');
    expect(row).toHaveTextContent('—');
    expect(row).not.toHaveTextContent('0 lbs');
  });

  test('titles the meat breakdown the way the design does', () => {
    renderStats(archive);

    expect(screen.getByTestId('stats-by-meat-note')).toHaveTextContent('sessions · pounds');
    expect(screen.getByTestId('stats-scores-note')).toHaveTextContent('all sessions');
  });

  test('gives each meat its own colour out of the probe rotation', () => {
    renderStats(archive);

    const colors = screen
      .getAllByTestId('stat-meat-row')
      .map(
        row => window.getComputedStyle(within(row).getByTestId('stat-bar-fill')).backgroundColor
      );

    expect(new Set(colors).size).toBe(3);
    expect(colors.every(color => color !== '')).toBe(true);
  });

  test('names the wood reached for most and counts the rest', () => {
    renderStats(archive);

    expect(screen.getByTestId('stats-by-wood-note')).toHaveTextContent('Hickory leads');

    const rows = screen.getAllByTestId('stat-wood-row');
    expect(rows[0]).toHaveTextContent('Hickory');
    expect(rows[0]).toHaveTextContent('8 cooks');
    // One cook is a cook, not one cooks.
    expect(rows[1]).toHaveTextContent('Apple');
    expect(rows[1]).toHaveTextContent('1 cook');
    expect(rows[1]).not.toHaveTextContent('1 cooks');
  });

  test('does not crown a leader when two woods are burned equally often', () => {
    // The bars under the note are exactly as long as each other here, so
    // naming either wood as leading would be contradicted by the chart itself
    // — and which of the two got named would flip on the sort.
    renderStats({
      ...archive,
      byWood: [
        { woodType: 'Apple', sessions: 5 },
        { woodType: 'Hickory', sessions: 5 },
      ],
    });

    const note = screen.getByTestId('stats-by-wood-note');
    expect(note).toHaveTextContent('Apple & Hickory tie');
    expect(note).not.toHaveTextContent('leads');
  });

  test('calls a tie between three or more woods what it is', () => {
    renderStats({
      ...archive,
      byWood: [
        { woodType: 'Apple', sessions: 5 },
        { woodType: 'Hickory', sessions: 5 },
        { woodType: 'Cherry', sessions: 5 },
        { woodType: 'Oak', sessions: 2 },
      ],
    });

    expect(screen.getByTestId('stats-by-wood-note')).toHaveTextContent('3-way tie');
  });

  test('scores each rating category against ten, to a tenth', () => {
    renderStats(archive);

    expect(screen.getByTestId('stat-score-smoke-flavor')).toHaveTextContent('Smoke flavor');
    expect(screen.getByTestId('stat-score-smoke-flavor')).toHaveTextContent('8.3');
    expect(screen.getByTestId('stat-score-seasoning')).toHaveTextContent('7.0');
    expect(screen.getByTestId('stat-score-tenderness')).toHaveTextContent('9.4');
    expect(screen.getByTestId('stat-score-overall-taste')).toHaveTextContent('8.6');

    // Ten is the scale, not the best score on the screen: a seven is seven
    // tenths of a full bar however the other categories did.
    const fill = within(screen.getByTestId('stat-score-seasoning')).getByTestId('stat-bar-fill');
    expect(fill).toHaveStyle({ width: '70%' });
  });

  test('leaves an unrated category empty rather than scoring it zero', () => {
    renderStats({
      ...archive,
      categoryAverages: { ...archive.categoryAverages, seasoning: null },
    });

    const row = screen.getByTestId('stat-score-seasoning');
    expect(row).toHaveTextContent('—');
    expect(within(row).getByTestId('stat-bar-fill')).toHaveStyle({ width: '0%' });
  });

  test('drops a breakdown nothing was recorded for instead of heading an empty card', () => {
    renderStats({ ...archive, byMeat: [], byWood: [] });

    expect(screen.queryByTestId('stats-by-meat')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stats-by-wood')).not.toBeInTheDocument();
    expect(screen.getByTestId('stats-records')).toBeInTheDocument();
  });

  test('paints itself out of the theme in dark mode too', () => {
    renderStats(archive, 'dark');

    expect(screen.getByTestId('stat-total-time')).toBeInTheDocument();
    expect(screen.getByTestId('stats-grid')).toBeInTheDocument();
    expect(screen.getByTestId('stats-records')).toBeInTheDocument();
    expect(screen.getByTestId('stats-by-meat')).toBeInTheDocument();
    expect(screen.getByTestId('stats-by-wood')).toBeInTheDocument();
    expect(screen.getByTestId('stats-scores')).toBeInTheDocument();
  });
});
