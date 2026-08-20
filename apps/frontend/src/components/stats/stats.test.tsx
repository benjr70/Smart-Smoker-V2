import '@testing-library/jest-dom';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../api';
import { FakeBackend, createFakeBackend } from '../../api/fakeBackend';
import { PreSmoke, Smoke } from '../../api/types';
import { DesignSurface, appTheme } from '../../theme';
import { Stats } from './stats';

const completedCook = (id: string): Smoke => ({
  _id: id,
  preSmokeId: `pre-${id}`,
  tempsId: `temps-${id}`,
  postSmokeId: `post-${id}`,
  smokeProfileId: `profile-${id}`,
  ratingId: `rating-${id}`,
  date: new Date('2026-04-20T12:00:00Z'),
  status: 1,
});

const archiveBackend = (): FakeBackend =>
  createFakeBackend({
    smoke: { all: [completedCook('smoke-1')] },
    preSmoke: {
      records: {
        'pre-smoke-1': {
          name: 'Sunday brisket',
          meatType: 'Brisket',
          weight: { weight: 12, unit: 'LB' },
          steps: [],
          notes: '',
        } as unknown as PreSmoke,
      },
    },
    smokeProfile: { records: { 'profile-smoke-1': { woodType: 'Hickory' } } },
    postSmoke: { records: { 'post-smoke-1': { restTime: '01:00', steps: [] } } },
    timeline: {
      records: {
        'smoke-1': {
          startedAt: null,
          finishedAt: null,
          durationMs: 6 * 60 * 60 * 1000,
          peakChamber: null,
          peakMeat: null,
          targetTemp: null,
        },
      },
    },
  });

const renderStats = (backend: FakeBackend) =>
  render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <ApiClientProvider client={createApiClient(backend)}>
          <SnackbarProvider>
            <Stats />
          </SnackbarProvider>
        </ApiClientProvider>
      </DesignSurface>
    </CssVarsProvider>
  );

describe('the Stats screen, wired to the backend', () => {
  test('shows what the archive adds up to', async () => {
    renderStats(archiveBackend());

    await screen.findByTestId('stat-total-time');
    expect(screen.getByTestId('stat-total-time')).toHaveTextContent('6h 00m');
    expect(screen.getByTestId('stat-total-meat')).toHaveTextContent('12 lbs');
    expect(screen.getByTestId('stat-total-rest')).toHaveTextContent('1h 00m');
  });

  test('greets a user with no completed cooks', async () => {
    renderStats(createFakeBackend());

    await screen.findByTestId('stats-empty');
  });

  test('says nothing about a user’s cooking until the read has landed', () => {
    renderStats(archiveBackend());

    // Neither the figures nor the "you have never cooked" greeting: both would
    // be claims about an archive nobody has been told the contents of yet.
    expect(screen.queryByTestId('stats-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stats-empty')).not.toBeInTheDocument();
  });

  test('offers another go when the statistics could not be read', async () => {
    const backend = archiveBackend();
    backend.injectFault({ method: 'get', path: 'stats', status: 503 });

    renderStats(backend);

    await screen.findByTestId('stats-load-failed');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
