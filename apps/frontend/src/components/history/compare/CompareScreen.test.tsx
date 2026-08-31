/**
 * The compare screen: two cooks side by side, read from the backend the way the
 * app reads them.
 *
 * Exercised whole — real hook, real cards, in-memory backend — because what is
 * worth asserting here is what a pitmaster sees: which cook is in which slot,
 * which colour says so, what the headline verdict reads, which facts are worth
 * their attention and which are the same in both cooks.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../../api';
import { createFakeBackend, FakeBackend } from '../../../api/fakeBackend';
import { Smoke } from '../../../api/types';
import { WeightUnits } from '../../common/interfaces/enums';
import { DesignSurface, appTheme, carbonLight } from '../../../theme';
import { CompareScreen } from './CompareScreen';

const smokeAggregate = (id: string, date: string): Smoke => ({
  _id: id,
  preSmokeId: `pre-${id}`,
  tempsId: `temps-${id}`,
  postSmokeId: `post-${id}`,
  smokeProfileId: `profile-${id}`,
  ratingId: `rating-${id}`,
  date: new Date(date),
  status: 1,
});

const seedTwoCooks = (): FakeBackend =>
  createFakeBackend({
    smoke: {
      records: {
        'smoke-a': smokeAggregate('smoke-a', '2026-08-01T12:00:00.000Z'),
        'smoke-b': smokeAggregate('smoke-b', '2026-07-04T12:00:00.000Z'),
      },
    },
    preSmoke: {
      records: {
        'pre-smoke-a': {
          name: 'Brisket',
          meatType: 'Beef',
          weight: { weight: 12, unit: WeightUnits.LB },
          steps: ['Trim'],
        },
        'pre-smoke-b': {
          name: 'Pork Butt',
          meatType: 'Pork',
          weight: { weight: 8, unit: WeightUnits.LB },
          steps: ['Rub'],
        },
      },
    },
    smokeProfile: {
      records: {
        'profile-smoke-a': {
          chamberName: 'Chamber',
          woodType: 'Hickory',
          notes: 'Clean thin smoke all day',
        },
        'profile-smoke-b': {
          chamberName: 'Chamber',
          woodType: 'Hickory',
          notes: 'Ran hot after lunch',
        },
      },
    },
    timeline: {
      records: {
        'smoke-a': {
          startedAt: '2026-08-01T06:00:00.000Z',
          finishedAt: '2026-08-01T18:30:00.000Z',
          durationMs: 45000000,
          peakChamber: 268,
          peakMeat: 203,
          targetTemp: 203,
        },
        'smoke-b': {
          startedAt: '2026-07-04T07:00:00.000Z',
          finishedAt: '2026-07-04T16:00:00.000Z',
          durationMs: 32400000,
          peakChamber: 291,
          peakMeat: 197,
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
          notes: '',
        },
        'rating-smoke-b': {
          smokeFlavor: 6,
          seasoning: 7,
          tenderness: 5,
          overallTaste: 6,
          notes: '',
        },
      },
    },
  });

const renderCompare = (
  backend: FakeBackend,
  props: Partial<React.ComponentProps<typeof CompareScreen>> = {}
) => {
  const client = createApiClient(backend);
  return render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <ApiClientProvider client={client}>
          <SnackbarProvider>
            <CompareScreen
              smokeIdA="smoke-a"
              smokeIdB="smoke-b"
              onBack={() => undefined}
              {...props}
            />
          </SnackbarProvider>
        </ApiClientProvider>
      </DesignSurface>
    </CssVarsProvider>
  );
};

/**
 * The row of the facts table whose label is `label`.
 *
 * Found by the fact it states rather than by a test id per row: the row's
 * identity is which of the eight facts it is, and Testing Library has no query
 * for "the element carrying this data attribute".
 */
const factRow = (label: string): HTMLElement =>
  // eslint-disable-next-line testing-library/no-node-access
  screen.getByTestId('compare-facts').querySelector(`[data-fact="${label}"]`) as HTMLElement;

describe('CompareScreen', () => {
  test('names each cook in its own slot, in its own colour', async () => {
    renderCompare(seedTwoCooks());

    await screen.findByTestId('compare-summary');

    const slotA = screen.getByTestId('compare-slot-a');
    expect(slotA).toHaveTextContent('COOK A');
    expect(slotA).toHaveTextContent('Brisket');
    expect(slotA).toHaveTextContent('Aug 1, 2026 · Beef');
    expect(within(slotA).getByTestId('compare-slot-dot')).toHaveStyle({
      backgroundColor: carbonLight.probes.probe2,
    });

    const slotB = screen.getByTestId('compare-slot-b');
    expect(slotB).toHaveTextContent('COOK B');
    expect(slotB).toHaveTextContent('Pork Butt');
    expect(slotB).toHaveTextContent('Jul 4, 2026 · Pork');
    expect(within(slotB).getByTestId('compare-slot-dot')).toHaveStyle({
      backgroundColor: carbonLight.probes.chamber,
    });
  });

  test('the swap control exchanges the two cooks', async () => {
    const backend = seedTwoCooks();
    renderCompare(backend);
    await screen.findByTestId('compare-summary');
    const readsBefore = backend.requests.length;

    await userEvent.click(screen.getByRole('button', { name: 'Swap cooks' }));

    expect(screen.getByTestId('compare-slot-a')).toHaveTextContent('Pork Butt');
    expect(screen.getByTestId('compare-slot-b')).toHaveTextContent('Brisket');
    expect(backend.requests).toHaveLength(readsBefore);
  });

  test('the summary says which cook scored higher, and by how much', async () => {
    renderCompare(seedTwoCooks());

    const summary = await screen.findByTestId('compare-summary');
    expect(summary).toHaveTextContent('Brisket scored higher overall — 2.5 points better.');
  });

  /**
   * Two cooks that scored the same have no headline verdict — a card claiming
   * one "scored higher" by 0.0 points is worse than saying nothing.
   */
  test('two cooks that scored the same get no verdict line', async () => {
    const backend = seedTwoCooks();
    backend.store.ratings.records['rating-smoke-b'] = {
      smokeFlavor: 6,
      seasoning: 7,
      tenderness: 5,
      overallTaste: 8.5,
      notes: '',
    };

    renderCompare(backend);

    await screen.findByTestId('compare-summary');
    expect(screen.getByTestId('compare-summary')).not.toHaveTextContent('scored higher');
  });

  /**
   * A cook nobody rated has no score, and a verdict is a comparison of two
   * scores: claiming a win over a cook that was never scored invents a result
   * the pitmaster never gave. Every slider starts at zero and a cook archived
   * without opening the ratings screen reads back as zeros, which is why a zero
   * is read as unrated here exactly as the archive's statistics read it.
   */
  test('a cook nobody rated gets no verdict against it', async () => {
    const backend = seedTwoCooks();
    delete backend.store.ratings.records['rating-smoke-b'];

    renderCompare(backend);

    const summary = await screen.findByTestId('compare-summary');
    expect(summary).toHaveTextContent('Pork Butt');
    expect(summary).not.toHaveTextContent('scored higher');
  });

  /**
   * Until both cooks are read there is nothing to compare, and the screen says
   * that it is reading them: a blank page under slot cards that read "Choose…"
   * tells a pitmaster on a slow link that nothing was selected and nothing is
   * coming, when in fact both are.
   */
  test('a comparison still being read says so, in the body and in both slots', async () => {
    renderCompare(seedTwoCooks());

    expect(screen.getByTestId('compare-loading')).toHaveTextContent('Reading both cooks…');
    expect(screen.getByTestId('compare-slot-a')).toHaveTextContent('Loading…');
    expect(screen.getByTestId('compare-slot-b')).toHaveTextContent('Reading this cook');
    expect(screen.queryByTestId('compare-empty')).toBeNull();
    expect(screen.queryByTestId('compare-facts')).toBeNull();

    // And once both have landed, the wait is over rather than merely hidden.
    await screen.findByTestId('compare-summary');
    expect(screen.queryByTestId('compare-loading')).toBeNull();
  });

  test('the facts table states the eight smoke facts for both cooks', async () => {
    renderCompare(seedTwoCooks());
    await screen.findByTestId('compare-summary');

    expect(
      screen.getAllByTestId('compare-fact-row').map(row => row.getAttribute('data-fact'))
    ).toEqual([
      'Meat',
      'Weight',
      'Wood',
      'Duration',
      'Target',
      'Peak chamber',
      'Peak probe',
      'Rest',
    ]);
    expect(factRow('Duration')).toHaveTextContent('12h 30m');
    expect(factRow('Duration')).toHaveTextContent('9h 00m');
    expect(factRow('Weight')).toHaveTextContent('12 LB');
    expect(factRow('Peak chamber')).toHaveTextContent('268°F');
    expect(factRow('Peak probe')).toHaveTextContent('197°F');
    expect(factRow('Rest')).toHaveTextContent('1h 00m');
    expect(factRow('Rest')).toHaveTextContent('30m');
  });

  /**
   * The table's whole job is to make differences catch the eye, so what both
   * cooks did the same way steps back into the secondary colour.
   */
  test('a fact both cooks share is greyed, and one that differs is not', async () => {
    renderCompare(seedTwoCooks());
    await screen.findByTestId('compare-summary');

    expect(within(factRow('Wood')).getByTestId('compare-fact-a')).toHaveStyle({
      color: carbonLight.textSecondary,
    });
    expect(within(factRow('Peak chamber')).getByTestId('compare-fact-a')).toHaveStyle({
      color: carbonLight.text,
    });
  });

  /**
   * A cook logged before the app derived any timing has no duration, no target
   * and no peaks. It is still comparable — those facts just read as absent.
   */
  test('a legacy cook with nothing derived reads as em-dashes', async () => {
    const backend = seedTwoCooks();
    delete backend.store.timeline.records['smoke-b'];

    renderCompare(backend);
    await screen.findByTestId('compare-summary');

    expect(within(factRow('Duration')).getByTestId('compare-fact-b')).toHaveTextContent('—');
    expect(within(factRow('Target')).getByTestId('compare-fact-b')).toHaveTextContent('—');
    expect(within(factRow('Peak probe')).getByTestId('compare-fact-b')).toHaveTextContent('—');
  });

  test("both cooks' smoke notes are shown, each under its own colour", async () => {
    renderCompare(seedTwoCooks());
    await screen.findByTestId('compare-summary');

    const notes = screen.getByTestId('compare-smoke-notes');
    expect(notes).toHaveTextContent('Clean thin smoke all day');
    expect(notes).toHaveTextContent('Ran hot after lunch');
    expect(within(notes).getByTestId('compare-note-prefix-a')).toHaveStyle({
      color: carbonLight.probes.probe2,
    });
    expect(within(notes).getByTestId('compare-note-prefix-b')).toHaveStyle({
      color: carbonLight.probes.chamber,
    });
  });

  test('a cook nobody wrote a note on says so rather than leaving a blank', async () => {
    const backend = seedTwoCooks();
    backend.store.smokeProfile.records['profile-smoke-b'] = {
      chamberName: 'Chamber',
      woodType: 'Hickory',
      notes: '',
    };

    renderCompare(backend);
    await screen.findByTestId('compare-summary');

    expect(
      within(screen.getByTestId('compare-smoke-notes')).getByTestId('compare-note-b')
    ).toHaveTextContent('No notes');
  });

  /**
   * A cook nobody named is still a cook, and still the one that scored higher.
   * The summary says so in words rather than leaving a gap in the sentence.
   */
  test('a cook nobody named is still named in the summary', async () => {
    const backend = seedTwoCooks();
    backend.store.preSmoke.records['pre-smoke-a'] = {
      meatType: 'Beef',
      weight: { weight: 12, unit: WeightUnits.LB },
      steps: [],
    };

    renderCompare(backend);

    const summary = await screen.findByTestId('compare-summary');
    expect(summary).toHaveTextContent('Unnamed cook');
    expect(summary).toHaveTextContent('The unnamed cook scored higher overall');
  });

  test('a cook nobody weighed, wooded or named a meat for reads as absent', async () => {
    const backend = seedTwoCooks();
    backend.store.preSmoke.records['pre-smoke-b'] = { name: 'Pork Butt', weight: {}, steps: [] };
    backend.store.smokeProfile.records['profile-smoke-b'] = { chamberName: 'Chamber' };

    renderCompare(backend);
    await screen.findByTestId('compare-summary');

    expect(within(factRow('Weight')).getByTestId('compare-fact-b')).toHaveTextContent('—');
    expect(within(factRow('Meat')).getByTestId('compare-fact-b')).toHaveTextContent('—');
    expect(within(factRow('Wood')).getByTestId('compare-fact-b')).toHaveTextContent('—');
  });

  /**
   * A comparison needs two cooks. One cook — a log with nothing to compare
   * against yet — is told what it would take, not shown half a comparison.
   */
  test('with fewer than two cooks there is nothing to compare', async () => {
    renderCompare(seedTwoCooks(), { smokeIdB: undefined });

    expect(await screen.findByTestId('compare-empty')).toHaveTextContent(
      'Log at least two cooks to compare them.'
    );
    expect(screen.queryByTestId('compare-facts')).toBeNull();
    // The one cook there is still lands in its slot, so the header is not a
    // pair of empty cards while the advice is read.
    await waitFor(() => expect(screen.getByTestId('compare-slot-a')).toHaveTextContent('Brisket'));
  });

  test('a cook that could not be read says so instead of comparing nothing', async () => {
    renderCompare(seedTwoCooks(), { smokeIdB: 'no-such-cook' });

    expect(await screen.findByTestId('compare-failed')).toHaveTextContent(
      'Could not load these cooks.'
    );
    await waitFor(() => expect(screen.getByTestId('compare-slot-a')).toHaveTextContent('Brisket'));
  });

  test('the back control returns to wherever the comparison was opened from', async () => {
    const onBack = jest.fn();
    renderCompare(seedTwoCooks(), { onBack });
    await screen.findByTestId('compare-summary');

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
