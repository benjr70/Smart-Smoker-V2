/**
 * A history card: what a past cook says about itself in the list, and the two
 * things that can be done to it.
 *
 * The card is rendered under the application's theme rather than with
 * Material-UI mocked out, so what is asserted is what a user would see and
 * reach — the words on the card, the rating it announces, and the two controls.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { SmokeHistory } from '../../../api/types';
import { DesignSurface, appTheme } from '../../../theme';
import { SmokeCard } from './SmokeCard';

const smoke = (fields: Partial<SmokeHistory> = {}): SmokeHistory => ({
  name: 'Sunday Brisket',
  meatType: 'Brisket',
  weight: '12',
  weightUnit: 'lbs',
  woodType: 'Hickory',
  date: 'Apr 20, 2026',
  smokeId: 'smoke-1',
  overAllRating: '7.5',
  durationMs: 6 * 60 * 60 * 1000 + 20 * 60 * 1000,
  ...fields,
});

const showCard = (fields: Partial<SmokeHistory> = {}) => {
  const onViewClick = jest.fn();
  const onDeleteClick = jest.fn();

  render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <SmokeCard smoke={smoke(fields)} onViewClick={onViewClick} onDeleteClick={onDeleteClick} />
      </DesignSurface>
    </CssVarsProvider>
  );

  return { onViewClick, onDeleteClick };
};

describe('a history card', () => {
  it('shows the cook’s name, what was cooked on what, and when', () => {
    showCard();

    expect(screen.getByTestId('smoke-card-name')).toHaveTextContent('Sunday Brisket');
    expect(screen.getByTestId('smoke-card-details')).toHaveTextContent(
      '12 lbs Brisket · Hickory wood'
    );
    expect(screen.getByTestId('smoke-card-date')).toHaveTextContent('Apr 20, 2026');
  });

  it('scores the cook out of ten and tags how long it ran', () => {
    showCard();

    expect(screen.getByRole('img', { name: 'Rated 7.5 out of 10' })).toBeInTheDocument();
    expect(screen.getByTestId('smoke-card-duration')).toHaveTextContent('6h 20m');
  });

  it('tags a cook of unknown length with an em-dash rather than a made-up time', () => {
    showCard({ durationMs: null });

    expect(screen.getByTestId('smoke-card-duration')).toHaveTextContent('—');
  });

  it('opens the cook it names when the card is pressed', async () => {
    const { onViewClick, onDeleteClick } = showCard();

    await userEvent.click(screen.getByRole('button', { name: 'View Sunday Brisket' }));

    expect(onViewClick).toHaveBeenCalledWith('smoke-1');
    expect(onDeleteClick).not.toHaveBeenCalled();
  });

  it('asks to delete the cook it names, without also opening it', async () => {
    const { onViewClick, onDeleteClick } = showCard();

    await userEvent.click(screen.getByRole('button', { name: 'Delete Sunday Brisket' }));

    expect(onDeleteClick).toHaveBeenCalledWith('smoke-1');
    // The trash sits inside the card the whole of which opens the cook; a tap
    // that both deletes and navigates would leave the confirmation behind a
    // screen the user never asked for.
    expect(onViewClick).not.toHaveBeenCalled();
  });
});
