/**
 * The cook log on its way to the chart: the same stamps, in the chart's own
 * terms, and the same list from one render to the next.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import { createTheme } from '@mui/material/styles';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { CookEvent } from '../../api/types';
import { DesignSurface, appTheme } from '../../theme';
import { useChartEvents } from './chartEvents';

const wrapped: CookEvent = {
  _id: 'event-1',
  smokeId: 'smoke-7',
  stampKey: 'wrap',
  label: 'Wrapped',
  tone: 'p1',
  at: new Date(2026, 7, 25, 14, 30),
  chamberTemp: 251,
  probe1Temp: 160,
  probe2Temp: null,
  probe3Temp: null,
};

describe('the cook log as the chart wants it', () => {
  it('gives each stamp its moment, its word and its tone', () => {
    const { result } = renderHook(() => useChartEvents([wrapped]), {
      wrapper: ({ children }) => (
        <CssVarsProvider theme={appTheme} defaultMode="light">
          <DesignSurface>{children}</DesignSurface>
        </CssVarsProvider>
      ),
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({ id: 'event-1', label: 'Wrapped' });
    expect(result.current[0].color).toMatch(/^#/);
  });

  /**
   * The chart derives its whole drawing from this list, so a new list means a
   * twelve-hour cook redrawn. Under a bare theme — one carrying no design at
   * all — the colours come from a fallback, and that fallback has to be the
   * same one every render or the holding is undone by the thing it holds.
   */
  it('hands back the same list on a re-render under a theme with no design', () => {
    const log = [wrapped];
    const { result, rerender } = renderHook(() => useChartEvents(log), {
      wrapper: ({ children }) => (
        <CssVarsProvider theme={createTheme()}>{children}</CssVarsProvider>
      ),
    });
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
