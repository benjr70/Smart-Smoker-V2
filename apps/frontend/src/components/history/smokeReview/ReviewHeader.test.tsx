/**
 * The detail header: which cook this is, when it actually happened, and how it
 * scored — with an em-dash anywhere the record holds no answer.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { DesignSurface, appTheme } from '../../../theme';
import { ReviewHeader, ReviewHeaderProps } from './ReviewHeader';

const showHeader = (fields: Partial<ReviewHeaderProps> = {}) =>
  render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <ReviewHeader
          name="Sunday Brisket"
          date={new Date(2026, 3, 20)}
          startedAt={new Date(2026, 3, 20, 9, 15)}
          finishedAt={new Date(2026, 3, 20, 15, 35)}
          overallRating={7.5}
          {...fields}
        />
      </DesignSurface>
    </CssVarsProvider>
  );

describe('the detail header', () => {
  it('names the cook and says when it ran, start to finish', () => {
    showHeader();

    expect(screen.getByRole('heading', { name: 'Sunday Brisket' })).toBeVisible();
    expect(screen.getByTestId('review-header-when')).toHaveTextContent(
      'Apr 20, 2026 · 9:15 AM – 3:35 PM'
    );
  });

  it('scores the cook with the star row', () => {
    showHeader();

    expect(screen.getByTestId('star-rating')).toHaveAccessibleName('Rated 7.5 out of 10');
  });

  it('admits unknown moments as em-dashes rather than inventing them', () => {
    showHeader({ date: null, startedAt: null, finishedAt: null });

    expect(screen.getByTestId('review-header-when')).toHaveTextContent('— · — – —');
  });

  it('shows an unrated cook as not rated instead of scoring it zero', () => {
    showHeader({ overallRating: 0 });

    expect(screen.getByTestId('star-rating')).toHaveAccessibleName('Not rated');
  });

  it('falls back to a name for a cook that was never named', () => {
    showHeader({ name: undefined });

    expect(screen.getByRole('heading', { name: 'Untitled Smoke' })).toBeVisible();
  });
});
