/**
 * The detail sections' field grid: labelled values, two to a row, with an
 * em-dash standing in wherever the record holds nothing. The grid is what makes
 * "this cook has no peak on record" read as an admission instead of a blank.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { DesignSurface, appTheme } from '../../../theme';
import { FieldGrid } from './FieldGrid';

const showGrid = (fields: React.ComponentProps<typeof FieldGrid>['fields']) =>
  render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <FieldGrid fields={fields} />
      </DesignSurface>
    </CssVarsProvider>
  );

describe('a detail field grid', () => {
  it('shows each field as its label over its value', () => {
    showGrid([
      { label: 'Cook Time', value: '6h 20m' },
      { label: 'Target Temp', value: '203°F' },
    ]);

    const fields = screen.getAllByTestId('field-grid-field');
    expect(fields).toHaveLength(2);
    expect(fields[0]).toHaveTextContent('Cook Time');
    expect(fields[0]).toHaveTextContent('6h 20m');
    expect(fields[1]).toHaveTextContent('Target Temp');
    expect(fields[1]).toHaveTextContent('203°F');
  });

  it('admits a value the record does not hold as an em-dash', () => {
    showGrid([
      { label: 'Peak Chamber', value: null },
      { label: 'Peak Meat', value: undefined },
      { label: 'Wood', value: '   ' },
    ]);

    screen.getAllByTestId('field-grid-field').forEach(field => {
      expect(field).toHaveTextContent('—');
    });
  });
});
