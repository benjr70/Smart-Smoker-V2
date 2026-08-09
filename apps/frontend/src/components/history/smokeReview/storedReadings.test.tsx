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
const renderReview = (cook = storedCook) => {
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
    temps: { records: { 'temps-1': cook } },
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

/**
 * The order the readings come back in.
 *
 * `GET /api/temps/:id` answers with the rows in the order the collection holds
 * them, and that order is newest-first. Read back that way, the review card
 * ruled its clock backwards — 15:00, 13:30, 12:00 left to right — and drew the
 * cook off the side of the plot, over the temperature labels, while still
 * rendering four paths and the right number of points. So the assertion here is
 * about direction and span, not about how much was drawn.
 */
describe('the review of a smoke whose readings come back newest-first', () => {
  const newestFirst = [...storedCook].reverse();

  const timeAxisOf = (container: HTMLElement): number[] =>
    Array.from(container.querySelectorAll('text[data-time-label]')).map(label =>
      new Date(label.getAttribute('data-time-label') as string).getTime()
    );

  it('rules its clock forwards, across the hours the cook covers', async () => {
    const { container } = renderReview(newestFirst);
    await waitFor(() => expect(screen.getByText('Hickory Wood')).toBeInTheDocument());

    const axis = timeAxisOf(container);

    expect(axis.length).toBeGreaterThan(1);
    expect(axis).toEqual([...axis].sort((one, other) => one - other));
    expect(axis[0]).toBeGreaterThanOrEqual(new Date('2026-08-08T12:00:00.000Z').getTime());
    expect(axis[axis.length - 1]).toBeLessThanOrEqual(
      new Date('2026-08-08T15:00:00.000Z').getTime()
    );
  });

  it('draws the cook across the plot, from its left edge to its right', async () => {
    const { container } = renderReview(newestFirst);
    await waitFor(() => expect(screen.getByText('Hickory Wood')).toBeInTheDocument());

    const xs = Array.from(container.querySelectorAll('path[data-series]'))
      .flatMap(line => (line.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?(?=,)/g) ?? [])
      .map(Number);

    // The compact box the History card draws in: 340 wide, with 34 left of the
    // plot for the temperature labels and 10 right of it. Drawn against an
    // inverted axis the cook ran from x = -404 to x = 768, off both sides.
    expect(xs.length).toBeGreaterThan(0);
    expect(Math.min(...xs)).toBeCloseTo(34, 5);
    expect(Math.max(...xs)).toBeCloseTo(330, 5);
  });
});
