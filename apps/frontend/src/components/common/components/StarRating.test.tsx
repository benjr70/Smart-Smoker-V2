/**
 * The read-only star display: what it says, and what it shows.
 *
 * The stars are asserted by the state each one is in rather than by the glyph
 * drawn for it, so the display can be redrawn without rewriting the test — but
 * a half star that silently became a full one still fails, because that is the
 * scaling this component exists for.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { DesignSurface, appTheme } from '../../../theme';
import { StarRating } from './StarRating';

const showRating = (value: number) =>
  render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <StarRating value={value} />
      </DesignSurface>
    </CssVarsProvider>
  );

const stars = (): (string | null)[] =>
  screen.getAllByTestId('star').map(star => star.getAttribute('data-star'));

describe('the star rating', () => {
  it('reads out the score it was given, out of ten', () => {
    showRating(7.5);

    expect(screen.getByRole('img', { name: 'Rated 7.5 out of 10' })).toBeInTheDocument();
    expect(screen.getByTestId('star-rating-value')).toHaveTextContent('7.5');
  });

  it('draws the score as five stars, halving the odd point', () => {
    showRating(7.5);

    expect(stars()).toEqual(['full', 'full', 'full', 'half', 'empty']);
  });

  it('shows a cook that was never scored as no stars and no score', () => {
    showRating(Number.NaN);

    expect(stars()).toEqual(['empty', 'empty', 'empty', 'empty', 'empty']);
    expect(screen.getByRole('img', { name: 'Not rated' })).toBeInTheDocument();
    expect(screen.queryByTestId('star-rating-value')).not.toBeInTheDocument();
  });
});
