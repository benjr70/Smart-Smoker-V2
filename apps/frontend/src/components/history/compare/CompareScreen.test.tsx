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
import { createFakeBackend, FakeBackend, StoredTempData } from '../../../api/fakeBackend';
import { Smoke, SmokeHistory } from '../../../api/types';
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

/**
 * A third cook, so there is something in the archive to pick that is not
 * already in one of the two slots.
 */
const seedThreeCooks = (): FakeBackend => {
  const backend = seedTwoCooks();
  backend.store.smoke.records['smoke-c'] = smokeAggregate('smoke-c', '2026-06-12T12:00:00.000Z');
  backend.store.preSmoke.records['pre-smoke-c'] = {
    name: 'Beer can chicken',
    meatType: 'Poultry',
    weight: { weight: 5, unit: WeightUnits.LB },
    steps: [],
  };
  backend.store.smokeProfile.records['profile-smoke-c'] = {
    chamberName: 'Chamber',
    woodType: 'Apple',
    notes: '',
  };
  backend.store.postSmoke.records['post-smoke-c'] = { restTime: '00:15', steps: [] };
  return backend;
};

/** The archive the picker offers, as the history read hands it over. */
const archiveRow = (smokeId: string, name: string, meatType: string): SmokeHistory => ({
  smokeId,
  name,
  meatType,
  weight: '10',
  weightUnit: 'LB',
  woodType: 'Oak',
  date: 'Aug 1, 2026',
  overAllRating: '8',
  durationMs: 3600000,
  notes: [],
});

const archive: SmokeHistory[] = [
  archiveRow('smoke-a', 'Brisket', 'Beef'),
  archiveRow('smoke-b', 'Pork Butt', 'Pork'),
  archiveRow('smoke-c', 'Beer can chicken', 'Poultry'),
];

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
    // One name for the nameless cook, in the swatch and in the verdict alike:
    // two spellings on one card read as two different cooks.
    expect(summary).toHaveTextContent('Unnamed cook scored higher overall');
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

  /**
   * The slot cards are the only place the comparison names its cooks — every
   * section below them identifies a cook by colour alone — so the control has
   * to say which cook is in it, not only what pressing it does. Naming it
   * "Change cook A" and nothing else leaves a screen-reader user comparing two
   * anonymous cooks.
   */
  test('a slot says which cook is in it, not only that it can be changed', async () => {
    renderCompare(seedThreeCooks(), { cooks: archive });

    // While the cook is on its way, and before there is one at all, the slot
    // says which of those it is rather than naming a cook it does not have.
    expect(screen.getByRole('button', { name: /Change cook A$/ })).toHaveAccessibleName(
      'Cook A: still being read. Change cook A'
    );

    await screen.findByTestId('compare-summary');

    expect(screen.getByRole('button', { name: /Change cook A$/ })).toHaveAccessibleName(
      'Cook A: Brisket, Aug 1, 2026, Beef. Change cook A'
    );
    expect(screen.getByRole('button', { name: /Change cook B$/ })).toHaveAccessibleName(
      'Cook B: Pork Butt, Jul 4, 2026, Pork. Change cook B'
    );
  });

  test('an empty slot says it is empty rather than naming nothing', async () => {
    renderCompare(seedThreeCooks(), { cooks: archive, smokeIdB: undefined });

    await screen.findByTestId('compare-empty');

    expect(screen.getByRole('button', { name: /Change cook B$/ })).toHaveAccessibleName(
      'Cook B: no cook chosen yet. Change cook B'
    );
  });

  /**
   * The slots are how the comparison is re-aimed: pressing one asks the archive
   * for a cook, and the cook that comes back lands in the slot that was pressed
   * and nowhere else.
   */
  test('a slot opens the picker for that slot, and the cook picked lands in it', async () => {
    renderCompare(seedThreeCooks(), { cooks: archive });
    await screen.findByTestId('compare-summary');

    await userEvent.click(screen.getByRole('button', { name: /Change cook A$/ }));
    expect(screen.getByTestId('cook-picker')).toHaveTextContent('PICK COOK A');

    await userEvent.click(screen.getByRole('button', { name: /^Pick Beer can chicken/ }));

    // The sheet has answered its one question, so it is gone.
    await waitFor(() => expect(screen.queryByTestId('cook-picker')).toBeNull());
    await waitFor(() =>
      expect(screen.getByTestId('compare-slot-a')).toHaveTextContent('Beer can chicken')
    );
    expect(screen.getByTestId('compare-slot-b')).toHaveTextContent('Pork Butt');
  });

  test('the cook in the other slot is offered as in use rather than as a choice', async () => {
    renderCompare(seedThreeCooks(), { cooks: archive });
    await screen.findByTestId('compare-summary');

    await userEvent.click(screen.getByRole('button', { name: /Change cook B$/ }));

    expect(screen.getByTestId('cook-picker')).toHaveTextContent('PICK COOK B');
    const inUse = screen.getByRole('button', { name: /^Pick Brisket/ });
    expect(inUse).toHaveTextContent('IN USE');
    expect(inUse).toBeDisabled();
  });

  /**
   * Choosing the cook that is already in the slot is a change of mind, not a
   * change of cook: the sheet closes and nothing is read again.
   */
  test('picking the cook already in the slot changes nothing', async () => {
    const backend = seedThreeCooks();
    renderCompare(backend, { cooks: archive });
    await screen.findByTestId('compare-summary');
    const readsBefore = backend.requests.length;

    await userEvent.click(screen.getByRole('button', { name: /Change cook A$/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Pick Brisket/ }));

    await waitFor(() => expect(screen.queryByTestId('cook-picker')).toBeNull());
    expect(screen.getByTestId('compare-slot-a')).toHaveTextContent('Brisket');
    expect(backend.requests).toHaveLength(readsBefore);
  });

  /**
   * A swap moves the cooks between the slots, so afterwards the slot on the
   * left is not the one the comparison was opened with. A pick still fills the
   * slot that was pressed — the alternative is a comparison that quietly
   * replaces the cook the pitmaster was looking at.
   */
  test('a pick after a swap still fills the slot that was pressed', async () => {
    renderCompare(seedThreeCooks(), { cooks: archive });
    await screen.findByTestId('compare-summary');

    await userEvent.click(screen.getByRole('button', { name: 'Swap cooks' }));
    expect(screen.getByTestId('compare-slot-a')).toHaveTextContent('Pork Butt');

    await userEvent.click(screen.getByRole('button', { name: /Change cook A$/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Pick Beer can chicken/ }));

    await waitFor(() =>
      expect(screen.getByTestId('compare-slot-a')).toHaveTextContent('Beer can chicken')
    );
    expect(screen.getByTestId('compare-slot-b')).toHaveTextContent('Brisket');
  });

  /**
   * Section 1 is the plan: what wood each cook was given, and what was done to
   * the meat before it went on — as a diff, since the point is the difference.
   */
  test('the pre-smoke section diffs the prep steps under the wood', async () => {
    renderCompare(seedTwoCooks());
    await screen.findByTestId('compare-summary');

    const section = screen.getByTestId('compare-diff-pre');
    expect(section).toHaveTextContent('PRE-SMOKE');
    expect(within(section).getByTestId('compare-diff-headline')).toHaveTextContent('Wood');
    // Both cooks burned hickory, so the headline is not a difference.
    expect(within(section).getByTestId('compare-diff-headline-a')).toHaveStyle({
      color: carbonLight.textSecondary,
    });
    expect(within(section).getByTestId('compare-diff-only-a')).toHaveTextContent('Trim');
    expect(within(section).getByTestId('compare-diff-only-b')).toHaveTextContent('Rub');
  });

  /** Section 3 is the same diff, hung off how long each cook rested. */
  test('the post-smoke section diffs the post steps under the rest', async () => {
    renderCompare(seedTwoCooks());
    await screen.findByTestId('compare-summary');

    const section = screen.getByTestId('compare-diff-post');
    expect(section).toHaveTextContent('POST-SMOKE');
    expect(within(section).getByTestId('compare-diff-headline')).toHaveTextContent('Rest');
    expect(within(section).getByTestId('compare-diff-headline-a')).toHaveTextContent('1h 00m');
    expect(within(section).getByTestId('compare-diff-headline-b')).toHaveTextContent('30m');
    // Both cooks rested, and nothing else was logged after the cook.
    expect(within(section).getByTestId('compare-diff-identical')).toBeInTheDocument();
  });

  test("each section carries that section's notes from both cooks", async () => {
    const backend = seedTwoCooks();
    backend.store.preSmoke.records['pre-smoke-a'] = {
      name: 'Brisket',
      meatType: 'Beef',
      weight: { weight: 12, unit: WeightUnits.LB },
      steps: ['Trim'],
      notes: 'Trimmed the cap hard',
    };
    backend.store.postSmoke.records['post-smoke-b'] = {
      restTime: '00:30',
      steps: ['Rest'],
      notes: 'Pulled it early',
    };

    renderCompare(backend);
    await screen.findByTestId('compare-summary');

    expect(
      within(screen.getByTestId('compare-diff-pre')).getByTestId('compare-diff-note-a')
    ).toHaveTextContent('Trimmed the cap hard');
    expect(
      within(screen.getByTestId('compare-diff-post')).getByTestId('compare-diff-note-b')
    ).toHaveTextContent('Pulled it early');
  });

  test('the ratings section scores both cooks on every axis', async () => {
    renderCompare(seedTwoCooks());
    await screen.findByTestId('compare-summary');

    const ratings = screen.getByTestId('compare-ratings');
    expect(within(ratings).getAllByTestId('compare-rating-row')).toHaveLength(4);
    expect(ratings).toHaveTextContent('8.0 · 6.0');
    expect(ratings).toHaveTextContent('▲2.0');
  });

  test('the back control returns to wherever the comparison was opened from', async () => {
    const onBack = jest.fn();
    renderCompare(seedTwoCooks(), { onBack });
    await screen.findByTestId('compare-summary');

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

/**
 * The overlay, which is the one thing on this screen drawn rather than written:
 * two cooks' traces on one plot, each in the colour its slot means.
 */
describe('the temperature overlay', () => {
  /** A cook's readings as the archive holds them, climbing over `hours`. */
  const storedCook = (start: string, hours: number, peak: number): StoredTempData[] =>
    Array.from({ length: 7 }, (_, step) => ({
      ChamberTemp: `${240 + step}`,
      MeatTemp: `${90 + Math.round(((peak - 90) * step) / 6)}`,
      Meat2Temp: '0',
      Meat3Temp: '0',
      date: new Date(new Date(start).getTime() + ((hours * 60 * 60_000) / 6) * step),
    }));

  const seedWithReadings = (): FakeBackend => {
    const backend = seedTwoCooks();
    backend.store.temps.records['temps-smoke-a'] = storedCook('2026-08-01T06:00:00.000Z', 12, 203);
    backend.store.temps.records['temps-smoke-b'] = storedCook('2026-07-04T07:00:00.000Z', 9, 197);
    return backend;
  };

  const overlayLine = (cook: 'a' | 'b', position: string): Element | null =>
    // eslint-disable-next-line testing-library/no-node-access
    screen
      .getByTestId('compare-chart')
      .querySelector(`path[data-cook="${cook}"][data-position="${position}"]`);

  test('draws both cooks on one plot, each in its slot’s colour', async () => {
    renderCompare(seedWithReadings());

    await screen.findByTestId('compare-chart');

    await waitFor(() =>
      expect(overlayLine('a', 'probe1')).toHaveAttribute('stroke', carbonLight.probes.probe2)
    );
    expect(overlayLine('b', 'probe1')).toHaveAttribute('stroke', carbonLight.probes.chamber);
    expect(screen.queryByTestId('compare-chart-placeholder')).not.toBeInTheDocument();
  });

  test('offers the positions the cooks ran and names them as each cook did', async () => {
    renderCompare(seedWithReadings());

    await screen.findByTestId('compare-chart');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Probe 1' })).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: 'Probe 3' })).not.toBeInTheDocument();
    // Neither cook named a probe, so each falls back to the position itself
    // rather than claiming a name the pitmaster never gave.
    expect(screen.getByTestId('compare-chart')).toHaveTextContent('Chamber');
  });

  /**
   * Which probes are shown is a question about the pair on the screen, and the
   * screen — not the chart — is what holds the answer, so a new pair is asked
   * afresh instead of inheriting chips chosen about two other cooks.
   */
  test('a change of cooks asks again which probes to show', async () => {
    renderCompare(seedWithReadings());
    await screen.findByTestId('compare-chart');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Chamber' })).toBeInTheDocument()
    );

    await userEvent.click(screen.getByRole('button', { name: 'Chamber' }));
    expect(screen.getByRole('button', { name: 'Chamber' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );

    await userEvent.click(screen.getByRole('button', { name: 'Swap cooks' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Chamber' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    );
  });
});
