/**
 * Section 1 of the history detail: what went into the smoker. The field grid
 * answers from the pre-smoke form — and answers with an em-dash for anything
 * the form never recorded.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PreSmoke } from '../../../api/types';
import { WeightUnits } from '../../common/interfaces/enums';
import { DesignSurface, appTheme } from '../../../theme';
import { PreSmokeSection } from './PreSmokeSection';

const showSection = (preSmoke: PreSmoke, woodType = 'Hickory') =>
  render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <PreSmokeSection preSmoke={preSmoke} woodType={woodType} />
      </DesignSurface>
    </CssVarsProvider>
  );

const fieldNamed = (label: string): HTMLElement => {
  const field = screen
    .getAllByTestId('field-grid-field')
    .find(candidate => candidate.textContent?.includes(label));
  expect(field).toBeDefined();
  return field as HTMLElement;
};

describe('the pre-smoke section', () => {
  it('shows what was cooked, how heavy, and on what wood', () => {
    showSection({
      name: 'Sunday Brisket',
      meatType: 'Brisket',
      weight: { weight: 12, unit: WeightUnits.LB },
      steps: ['Trim', 'Season'],
      notes: 'Prime grade this time.',
    });

    expect(fieldNamed('Session Name')).toHaveTextContent('Sunday Brisket');
    expect(fieldNamed('Meat Type')).toHaveTextContent('Brisket');
    expect(fieldNamed('Weight')).toHaveTextContent('12 LB');
    expect(fieldNamed('Wood')).toHaveTextContent('Hickory');

    const steps = screen.getAllByTestId('step-list-step');
    expect(steps[0]).toHaveTextContent('Trim');
    expect(steps[1]).toHaveTextContent('Season');
    expect(screen.getByTestId('note-block')).toHaveTextContent('Prime grade this time.');
  });

  it('admits everything a bare record lacks as em-dashes', () => {
    showSection({ weight: {}, steps: [] }, '');

    ['Session Name', 'Meat Type', 'Weight', 'Wood'].forEach(label => {
      expect(fieldNamed(label)).toHaveTextContent('—');
    });
    expect(screen.queryByTestId('step-list-step')).not.toBeInTheDocument();
    expect(screen.queryByTestId('note-block')).not.toBeInTheDocument();
  });
});
