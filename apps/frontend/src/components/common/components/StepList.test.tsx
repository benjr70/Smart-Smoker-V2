/**
 * The detail sections' step list: the steps a cook was prepped or rested by, in
 * the order they were written, numbered the way the design numbers them.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { DesignSurface, appTheme } from '../../../theme';
import { StepList } from './StepList';

const showSteps = (steps: string[]) =>
  render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <StepList label="Prep Steps" steps={steps} />
      </DesignSurface>
    </CssVarsProvider>
  );

describe('a detail step list', () => {
  it('numbers each step in the order it was written', () => {
    showSteps(['Trim the fat cap', 'Season overnight']);

    const steps = screen.getAllByTestId('step-list-step');
    expect(steps).toHaveLength(2);
    expect(steps[0]).toHaveTextContent('1');
    expect(steps[0]).toHaveTextContent('Trim the fat cap');
    expect(steps[1]).toHaveTextContent('2');
    expect(steps[1]).toHaveTextContent('Season overnight');
    expect(screen.getByText('Prep Steps')).toBeVisible();
  });

  it('shows nothing at all when no steps were written', () => {
    showSteps([]);

    expect(screen.queryByText('Prep Steps')).not.toBeInTheDocument();
    expect(screen.queryByTestId('step-list-step')).not.toBeInTheDocument();
  });
});
