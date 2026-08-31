/**
 * The compare read: two cooks, each read whole, held in the A and B slots.
 *
 * Asserted at the hook's own seam against the in-memory backend — what a cook
 * comes back as, what the pair reads as while it is still arriving or after a
 * read failed, and what swapping does (and, more to the point, does not do) to
 * the reads that already happened.
 */
import '@testing-library/jest-dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider } from './ApiClientProvider';
import { createApiClient } from './client';
import { createFakeBackend, FakeBackend } from './fakeBackend';
import { SnackbarProvider } from './SnackbarProvider';
import { Smoke } from './types';
import { useCompare } from './useCompare';

const smokeAggregate = (id: string): Smoke => ({
  _id: id,
  preSmokeId: `pre-${id}`,
  tempsId: `temps-${id}`,
  postSmokeId: `post-${id}`,
  smokeProfileId: `profile-${id}`,
  ratingId: `rating-${id}`,
  date: new Date('2023-07-15'),
  status: 1,
});

/** A backend holding two whole cooks, each with everything compare reads. */
const seedTwoCooks = (): FakeBackend =>
  createFakeBackend({
    smoke: {
      records: { 'smoke-a': smokeAggregate('smoke-a'), 'smoke-b': smokeAggregate('smoke-b') },
    },
    preSmoke: {
      records: {
        'pre-smoke-a': { name: 'Brisket', meatType: 'Beef', weight: {}, steps: ['Trim'] },
        'pre-smoke-b': { name: 'Pork Butt', meatType: 'Pork', weight: {}, steps: ['Rub'] },
      },
    },
    smokeProfile: {
      records: {
        'profile-smoke-a': { chamberName: 'Chamber', woodType: 'Hickory', notes: 'clean smoke' },
        'profile-smoke-b': { chamberName: 'Chamber', woodType: 'Oak', notes: 'billowing' },
      },
    },
    temps: {
      records: {
        'temps-smoke-a': [
          {
            ChamberTemp: '225',
            MeatTemp: '145',
            Meat2Temp: '0',
            Meat3Temp: '0',
            date: new Date('2026-08-01T10:00:00Z'),
          },
        ],
        'temps-smoke-b': [
          {
            ChamberTemp: '250',
            MeatTemp: '160',
            Meat2Temp: '0',
            Meat3Temp: '0',
            date: new Date('2026-08-10T10:00:00Z'),
          },
        ],
      },
    },
    timeline: {
      records: {
        'smoke-a': {
          startedAt: '2026-08-01T10:00:00.000Z',
          finishedAt: '2026-08-01T16:30:00.000Z',
          durationMs: 23400000,
          peakChamber: 268,
          peakMeat: 203,
          targetTemp: 203,
        },
      },
    },
    postSmoke: {
      records: {
        'post-smoke-a': { restTime: '01:00', steps: ['Rest'] },
        'post-smoke-b': { restTime: '00:30', steps: ['Rest'] },
      },
    },
    ratings: {
      records: {
        'rating-smoke-a': {
          smokeFlavor: 8,
          seasoning: 7,
          tenderness: 9,
          overallTaste: 8.5,
          notes: 'great',
        },
        'rating-smoke-b': {
          smokeFlavor: 6,
          seasoning: 7,
          tenderness: 5,
          overallTaste: 6,
          notes: 'ok',
        },
      },
    },
    cookEvents: {
      current: [
        {
          _id: 'event-1',
          smokeId: 'smoke-a',
          stampKey: 'wrap',
          label: 'Wrapped',
          tone: 'amber',
          at: '2026-08-01T13:00:00.000Z',
          chamberTemp: 250,
        } as never,
      ],
    },
  });

const renderCompare = (backend: FakeBackend, idA?: string, idB?: string) => {
  const client = createApiClient(backend);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ApiClientProvider client={client}>
      <SnackbarProvider>{children}</SnackbarProvider>
    </ApiClientProvider>
  );
  return renderHook(() => useCompare(idA, idB), { wrapper });
};

describe('useCompare', () => {
  test('reads each cook whole — its record, its log, its timing and its chart series', async () => {
    const backend = seedTwoCooks();

    const { result } = renderCompare(backend, 'smoke-a', 'smoke-b');

    await waitFor(() => expect(result.current.status).toBe('ready'));

    const a = result.current.a;
    expect(a?.smokeId).toBe('smoke-a');
    expect(a?.name).toBe('Brisket');
    expect(a?.preSmoke.meatType).toBe('Beef');
    expect(a?.smokeProfile.woodType).toBe('Hickory');
    expect(a?.postSmoke.restTime).toBe('01:00');
    expect(a?.rating.overallTaste).toBe(8.5);
    expect(a?.timeline?.peakChamber).toBe(268);
    expect(a?.events.map(event => event.label)).toEqual(['Wrapped']);
    expect(a?.series).toEqual([
      {
        date: new Date('2026-08-01T10:00:00Z'),
        chamberTemp: 225,
        probe1Temp: 145,
        probe2Temp: null,
        probe3Temp: null,
      },
    ]);

    expect(result.current.b?.name).toBe('Pork Butt');
    // The cook's own series, read by the temps id its record carries.
    expect(result.current.b?.series[0].chamberTemp).toBe(250);
  });

  /**
   * Swapping is a change of seat, not a change of subject: both cooks are
   * already in hand, so exchanging them asks the backend nothing.
   */
  test('swapping exchanges the slots and reads nothing again', async () => {
    const backend = seedTwoCooks();

    const { result } = renderCompare(backend, 'smoke-a', 'smoke-b');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const readsBefore = backend.requests.length;

    act(() => result.current.swap());

    expect(result.current.a?.name).toBe('Pork Butt');
    expect(result.current.b?.name).toBe('Brisket');
    expect(backend.requests).toHaveLength(readsBefore);
  });

  /**
   * A legacy cook — one logged before stamps existed, or one whose readings
   * cannot be fetched — is still comparable. It just has less on the screen.
   */
  test('a cook whose log and readings could not be fetched still compares', async () => {
    const backend = seedTwoCooks();
    backend.injectFault({ method: 'get', path: 'cook-events/smoke/smoke-a', status: 500 });
    backend.injectFault({
      method: 'get',
      path: 'temps/temps-smoke-a/series?points=300',
      status: 500,
    });

    const { result } = renderCompare(backend, 'smoke-a', 'smoke-b');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.a?.name).toBe('Brisket');
    expect(result.current.a?.events).toEqual([]);
    expect(result.current.a?.series).toEqual([]);
  });

  /**
   * A cook that stored no readings has no series to ask for — the chart draws
   * nothing rather than the app asking after a series under an empty id.
   */
  test('a cook that recorded no readings is not asked for a chart series', async () => {
    const backend = seedTwoCooks();
    backend.store.smoke.records['smoke-a'] = {
      ...smokeAggregate('smoke-a'),
      tempsId: '',
    };

    const { result } = renderCompare(backend, 'smoke-a', 'smoke-b');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.a?.series).toEqual([]);
    expect(backend.requests.map(request => request.path)).not.toContain('temps//series?points=300');
  });

  test('with only one cook chosen there is nothing to compare yet', async () => {
    const backend = seedTwoCooks();

    const { result } = renderCompare(backend, 'smoke-a', undefined);

    await waitFor(() => expect(result.current.a).not.toBeNull());
    expect(result.current.status).toBe('idle');
    expect(result.current.b).toBeNull();
  });

  test('a cook that cannot be read at all fails the comparison', async () => {
    const backend = seedTwoCooks();

    const { result } = renderCompare(backend, 'smoke-a', 'no-such-cook');

    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.b).toBeNull();
  });
});
