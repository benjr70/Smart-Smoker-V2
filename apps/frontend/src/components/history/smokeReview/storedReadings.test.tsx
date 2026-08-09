/**
 * A stored cook, read back the way the backend actually stored it.
 *
 * The temps collection keeps every temperature as a string, so a finished smoke
 * comes back off the wire as `"225"` where the domain type promises 225. The
 * review screen is rendered here over the fake backend seeded in that stored
 * shape — cards and chart unmocked — because the only assertion worth making is
 * that the operator sees their cook drawn, and a chart handed strings draws four
 * lines with nothing in them while looking, to any test that merely counts
 * paths, exactly like a chart that is working.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../../api';
import { createFakeBackend } from '../../../api/fakeBackend';
import { Smoke } from '../../../api/types';
import { DesignSurface, appTheme } from '../../../theme';
import { SmokeReview } from './smokeReview';

const smoke: Smoke = {
  _id: 'smoke-1',
  preSmokeId: 'pre-1',
  tempsId: 'temps-1',
  postSmokeId: 'post-1',
  smokeProfileId: 'profile-1',
  ratingId: 'rating-1',
  date: new Date('2026-08-08T12:00:00.000Z'),
  status: 1,
};

/**
 * The cook as the collection holds it: readings as strings, a chamber and one
 * meat probe in use, over three hours.
 */
const storedCook = [
  {
    ChamberTemp: '225',
    MeatTemp: '140',
    Meat2Temp: '0',
    Meat3Temp: '0',
    date: new Date('2026-08-08T12:00:00.000Z'),
  },
  {
    ChamberTemp: '240',
    MeatTemp: '155',
    Meat2Temp: '0',
    Meat3Temp: '0',
    date: new Date('2026-08-08T13:30:00.000Z'),
  },
  {
    ChamberTemp: '235',
    MeatTemp: '203',
    Meat2Temp: '0',
    Meat3Temp: '0',
    date: new Date('2026-08-08T15:00:00.000Z'),
  },
];

/** The review screen, mounted and themed as the application root mounts it. */
const renderReview = () => {
  const backend = createFakeBackend({
    smoke: { records: { 'smoke-1': smoke } },
    smokeProfile: {
      records: {
        'profile-1': {
          chamberName: 'Chamber',
          probe1Name: 'Point',
          probe2Name: 'Flat',
          probe3Name: 'Ambient',
          notes: 'Low and slow',
          woodType: 'Hickory',
        },
      },
    },
    temps: { records: { 'temps-1': storedCook } },
  });

  return render(
    <CssVarsProvider theme={appTheme}>
      <DesignSurface>
        <ApiClientProvider client={createApiClient(backend)}>
          <SnackbarProvider>
            <SmokeReview smokeId="smoke-1" />
          </SnackbarProvider>
        </ApiClientProvider>
      </DesignSurface>
    </CssVarsProvider>
  );
};

describe('the review of a smoke whose readings were stored as strings', () => {
  it('draws the cook rather than an empty chart', async () => {
    const { container } = renderReview();
    await waitFor(() => expect(screen.getByText('Hickory Wood')).toBeInTheDocument());

    const drawn = Array.from(container.querySelectorAll('path[data-series]')).map(line =>
      line.getAttribute('d')
    );

    // The chamber and the one meat probe that was in the meat were recorded, so
    // both are drawn as lines between moments rather than as nothing at all.
    expect(drawn.filter(d => d && /[LC]/.test(d))).toHaveLength(2);
  });

  it('reaches the temperatures the cook actually recorded', async () => {
    const { container } = renderReview();
    await waitFor(() => expect(screen.getByText('Hickory Wood')).toBeInTheDocument());

    // The axis is read rather than the paths: a string reading that slipped
    // through uncoerced would still be drawn somewhere, but the axis it was
    // scaled against would not be the one a 140°-to-203° climb needs.
    const labels = Array.from(container.querySelectorAll('svg text')).map(
      label => label.textContent
    );

    expect(labels).toContain('150°');
    expect(labels).toContain('200°');
  });
});
