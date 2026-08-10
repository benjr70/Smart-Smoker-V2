import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import { appTheme } from '../../../theme';
import { SmokeStatusBar } from './SmokeStatusBar';

const START = new Date('2026-08-01T10:00:00.000Z');

const renderBar = (props: { smoking: boolean; startedAt: Date | null }) =>
  render(
    <CssVarsProvider theme={appTheme} defaultMode="dark">
      <SmokeStatusBar {...props} />
    </CssVarsProvider>
  );

describe('SmokeStatusBar', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T12:15:30.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('a running cook reads "Smoking" beside a clock counting from its start', () => {
    renderBar({ smoking: true, startedAt: START });

    expect(screen.getByTestId('smoke-status-label')).toHaveTextContent('Smoking');
    expect(screen.getByTestId('smoke-elapsed-clock')).toHaveTextContent('02:15:30');

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId('smoke-elapsed-clock')).toHaveTextContent('02:15:31');
  });

  test('a cook nobody has started reads "Paused" at a clock that does not move', () => {
    renderBar({ smoking: false, startedAt: START });

    expect(screen.getByTestId('smoke-status-label')).toHaveTextContent('Paused');

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(screen.getByTestId('smoke-elapsed-clock')).toHaveTextContent('02:15:30');
  });

  test('the state dot says which state it is showing, for anyone not seeing the colour', () => {
    const { rerender } = renderBar({ smoking: true, startedAt: START });

    expect(screen.getByTestId('smoke-status-dot')).toHaveAttribute('data-smoking', 'true');

    rerender(
      <CssVarsProvider theme={appTheme} defaultMode="dark">
        <SmokeStatusBar smoking={false} startedAt={START} />
      </CssVarsProvider>
    );

    expect(screen.getByTestId('smoke-status-dot')).toHaveAttribute('data-smoking', 'false');
  });
});
