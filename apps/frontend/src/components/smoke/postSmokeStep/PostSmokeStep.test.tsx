import '@testing-library/jest-dom';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../../api';
import { createFakeBackend, FakeBackend } from '../../../api/fakeBackend';
import { PostSmoke, Smoke } from '../../../api/types';
import { DesignSurface, appTheme } from '../../../theme';
import { WeightUnits } from '../../common/interfaces/enums';
import { PostSmokeStep } from './PostSmokeStep';

const seededPostSmoke: PostSmoke = {
  restTime: '01:30',
  steps: ['Rest wrapped', 'Slice'],
  notes: 'Post-smoke notes',
};

/**
 * The step, mounted the way the application root mounts it: inside the colour
 * scheme provider and the design's palette, which is where its labels and cards
 * take their colours from.
 */
const renderStep = (backend: FakeBackend) => {
  const client = createApiClient(backend);
  const nextButton = <button data-testid="next-button">Next</button>;
  return render(
    <CssVarsProvider theme={appTheme}>
      <DesignSurface>
        <ApiClientProvider client={client}>
          <SnackbarProvider>
            <PostSmokeStep nextButton={nextButton} />
          </SnackbarProvider>
        </ApiClientProvider>
      </DesignSurface>
    </CssVarsProvider>
  );
};

describe('PostSmokeStep', () => {
  test('loads the seeded post-smoke from the injected client on mount', async () => {
    const backend = createFakeBackend({ postSmoke: { current: seededPostSmoke } });

    renderStep(backend);

    expect(await screen.findByDisplayValue('Post-smoke notes')).toBeInTheDocument();
    expect(screen.getByTestId('next-button')).toBeInTheDocument();
  });

  test('edits notes and persists the latest value to the backend on unmount', async () => {
    const backend = createFakeBackend({ postSmoke: { current: seededPostSmoke } });

    const { unmount } = renderStep(backend);

    await screen.findByDisplayValue('Post-smoke notes');
    // Addressed the way the e2e journey addresses it: by its stable test id,
    // not by the value it happens to be holding.
    const notesField = screen.getByTestId('postsmoke-notes-input');
    fireEvent.change(notesField, { target: { value: 'Updated notes' } });
    expect(notesField).toHaveValue('Updated notes');

    unmount();

    await waitFor(() => expect(backend.store.postSmoke.current?.notes).toBe('Updated notes'));
  });

  test('enters a rest time through the masked input and persists it on unmount', async () => {
    // The field is masked (HH:MM), so what a pitmaster types is rewritten before
    // it ever reaches state — the value that gets stored is the mask's, and the
    // e2e journey reads that value back from the backend after a reload.
    const backend = createFakeBackend({ postSmoke: { current: seededPostSmoke } });

    const { unmount } = renderStep(backend);

    // Driven with an `input` event, which is what typing (and Playwright's
    // `fill`) raises: the mask only rewrites what it is told about that way, and
    // a bare `change` event slips past it, leaving the field showing a value the
    // step would never save.
    await screen.findByDisplayValue('01:30');
    const restTime = screen.getByTestId('postsmoke-rest-time-input');
    fireEvent.input(restTime, { target: { value: '0245' } });
    expect(restTime).toHaveValue('02:45');

    unmount();

    await waitFor(() => expect(backend.store.postSmoke.current?.restTime).toBe('02:45'));
  });

  test('edits a step and persists the updated steps on unmount', async () => {
    const backend = createFakeBackend({ postSmoke: { current: seededPostSmoke } });

    const { unmount } = renderStep(backend);

    const firstStep = await screen.findByDisplayValue('Rest wrapped');
    fireEvent.change(firstStep, { target: { value: 'Rest in cooler' } });

    unmount();

    await waitFor(() => expect(backend.store.postSmoke.current?.steps).toContain('Rest in cooler'));
  });

  test('adds, edits and drops wrap-up steps, persisting the survivors in order', async () => {
    // What is done to the meat after it comes off is a plan like the prep one,
    // and is revised the same way: a step added, a step dropped, the rest kept
    // in the order they will be done in.
    const backend = createFakeBackend({
      postSmoke: { current: { ...seededPostSmoke, steps: ['Rest wrapped'] } },
    });

    const { unmount } = renderStep(backend);

    await screen.findByDisplayValue('Rest wrapped');
    const rows = () => screen.getAllByTestId('postsmoke-step-row');
    const stepInput = (index: number) => within(rows()[index]).getByTestId('postsmoke-step-input');

    fireEvent.click(screen.getByTestId('postsmoke-step-add-button'));
    fireEvent.change(stepInput(1), { target: { value: 'Hold in the cooler' } });
    fireEvent.click(screen.getByTestId('postsmoke-step-add-button'));
    fireEvent.change(stepInput(2), { target: { value: 'Slice against the grain' } });

    fireEvent.click(within(rows()[1]).getByTestId('postsmoke-step-remove-button'));
    expect(rows()).toHaveLength(2);

    unmount();

    await waitFor(() =>
      expect(backend.store.postSmoke.current?.steps).toEqual([
        'Rest wrapped',
        'Slice against the grain',
      ])
    );
  });

  test('labels its fields in the design’s uppercase, and says how a rest time is written', async () => {
    // The rest-time field is masked to `HH:MM` and rewrites what is typed into
    // it. Without a word about the format that rewriting looks like the field
    // eating the input: "90" for an hour and a half becomes "90:" and then
    // refuses the rest. The design says the format in the label — before
    // anything has been typed — and keeps the hint under the field for what the
    // answer is *for*.
    const backend = createFakeBackend({ postSmoke: { current: seededPostSmoke } });

    renderStep(backend);
    await screen.findByDisplayValue('01:30');

    const restTime = screen.getByTestId('postsmoke-rest-time-input');
    expect(screen.getByLabelText('Rest Time (HH:MM)')).toBe(restTime);
    expect(screen.getByText('Rest Time (HH:MM)')).toHaveStyle({ textTransform: 'uppercase' });
    expect(restTime).toHaveAccessibleDescription('How long will you let it rest?');

    expect(screen.getByLabelText('Notes')).toBe(screen.getByTestId('postsmoke-notes-input'));
    expect(screen.getByText('Notes')).toHaveStyle({ textTransform: 'uppercase' });
  });

  test('says what the notes are for, in a hint that survives the first keystroke', async () => {
    // The design puts this under the field. It used to be a placeholder, which
    // is gone the moment anything is typed — so the one moment a pitmaster might
    // wonder whether this is the right box for "the flat came out dry" is the
    // moment the answer disappears.
    const backend = createFakeBackend({ postSmoke: { current: seededPostSmoke } });

    renderStep(backend);
    await screen.findByDisplayValue('01:30');

    const notes = screen.getByTestId('postsmoke-notes-input');
    expect(notes).toHaveAccessibleDescription('Final thoughts on the cook');

    fireEvent.change(notes, { target: { value: 'Bark was perfect' } });

    expect(notes).toHaveAccessibleDescription('Final thoughts on the cook');
  });

  test('lays its fields out as one flat column, without the smoke step’s card chrome', async () => {
    // The design cards the live smoke — readings, chart and details are separate
    // things to look at — and leaves the two forms flat: one column of fields
    // read top to bottom. Three raised surfaces down a form make it look like
    // three forms.
    const backend = createFakeBackend({ postSmoke: { current: seededPostSmoke } });

    const { container } = renderStep(backend);
    await screen.findByDisplayValue('01:30');

    expect(container.querySelectorAll('.MuiPaper-root')).toHaveLength(0);
  });

  test('raises the snackbar when loading the post-smoke fails', async () => {
    const backend = createFakeBackend({ postSmoke: { current: seededPostSmoke } });
    backend.injectFault({ method: 'get', path: 'postSmoke/current', status: 500 });

    renderStep(backend);

    expect(await screen.findByText('Could not load post-smoke details.')).toBeInTheDocument();
  });
});

/**
 * The step a cook lands on the moment the meat comes off: the rest is already
 * running, counted from the pull the advance stamped, and the field that says
 * how long it runs for is the planner's rest duration rather than a second
 * opinion about it.
 */
describe('the rest timer on the Post-Smoke step', () => {
  const PULL_AT = '2026-08-30T17:00:00.000Z';

  /** A session whose cook has been pulled, with a weight to scale carryover by. */
  const pulledCook = (
    smoke: Partial<Smoke> = {},
    settings?: Record<string, unknown>
  ): FakeBackend =>
    createFakeBackend({
      state: { smokeId: 'cook-1', smoking: false },
      smoke: {
        records: {
          'cook-1': {
            preSmokeId: 'pre-1',
            tempsId: 'temps-1',
            postSmokeId: 'post-1',
            smokeProfileId: 'profile-1',
            ratingId: 'rating-1',
            date: new Date('2026-08-30T09:00:00.000Z'),
            status: 0,
            // As the wire carries it, which is what a real deployment answers.
            pullAt: PULL_AT as unknown as Date,
            pullTemp: 203,
            restMinutes: 60,
            ...smoke,
          },
        },
      },
      preSmoke: {
        current: {
          name: 'Brisket',
          meatType: 'Beef',
          weight: { weight: 14, unit: WeightUnits.LB },
          steps: [''],
          notes: '',
        },
      },
      postSmoke: { current: seededPostSmoke },
      ...(settings ? { appSettings: { settings } } : {}),
    });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-30T17:10:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('counts the rest of the cook that was just pulled', async () => {
    renderStep(pulledCook());

    expect(await screen.findByTestId('rest-timer-card')).toBeInTheDocument();
    expect(screen.getByTestId('rest-timer-remaining')).toHaveTextContent('50:00');
    // Scaled by the weight the pre-smoke step recorded: a fourteen-pound
    // packer is a large cut.
    expect(screen.getByTestId('rest-timer-carryover')).toHaveTextContent('213°F');
  });

  test('counts the rest from the duration the planner stores, not the typed field', async () => {
    // The record says an hour and a half; the cook's canonical rest says one
    // hour, and the two are one value — the stored one.
    renderStep(pulledCook());

    expect(await screen.findByTestId('rest-timer-remaining')).toHaveTextContent('50:00');
    expect(screen.getByTestId('postsmoke-rest-time-input')).toHaveValue('01:00');
  });

  test('writes an edited rest time to the duration the planner reads', async () => {
    const backend = pulledCook();

    const { unmount } = renderStep(backend);

    await screen.findByTestId('rest-timer-card');
    fireEvent.input(screen.getByTestId('postsmoke-rest-time-input'), {
      target: { value: '0230' },
    });
    // The countdown is against the new rest at once: the field and the timer
    // are two views of one duration, not a form that is read on the way out.
    expect(screen.getByTestId('rest-timer-remaining')).toHaveTextContent('2:20:00');

    unmount();

    await waitFor(() => expect(backend.store.smoke.records['cook-1'].restMinutes).toBe(150));
    // And the record keeps its own words for the rest, as history reads it.
    await waitFor(() => expect(backend.store.postSmoke.current?.restTime).toBe('02:30'));
  });

  test('shows no rest timer when the Serve Plan is switched off', async () => {
    renderStep(pulledCook({}, { servePlan: { enabled: false, driftAlert: false, driftMin: 30 } }));

    expect(await screen.findByDisplayValue('Post-smoke notes')).toBeInTheDocument();
    expect(screen.queryByTestId('rest-timer-card')).not.toBeInTheDocument();
  });

  /**
   * The switch is the whole feature, and a switch that could not be read is not
   * a switch that is on: a pitmaster who turned the Serve Plan off must not be
   * shown the card because a settings read timed out. The rest is still stored
   * on the cook, so nothing is lost by waiting for an answer.
   */
  test('shows no rest timer when the Serve Plan settings cannot be read', async () => {
    const backend = pulledCook();
    backend.injectFault({ method: 'get', path: 'appSettings', status: 500 });

    renderStep(backend);

    expect(await screen.findByDisplayValue('Post-smoke notes')).toBeInTheDocument();
    expect(screen.queryByTestId('rest-timer-card')).not.toBeInTheDocument();
  });

  /**
   * The weight is only what scales the carryover, so a pre-smoke that could not
   * be read takes the card no further than an unweighed cut does: the smaller
   * rise, and the countdown left standing.
   */
  test('keeps counting when the pre-smoke weight cannot be read', async () => {
    const backend = pulledCook();
    backend.injectFault({ method: 'get', path: 'presmoke/', status: 500 });

    renderStep(backend);

    expect(await screen.findByTestId('rest-timer-remaining')).toHaveTextContent('50:00');
    expect(screen.getByTestId('rest-timer-carryover')).toHaveTextContent('208°F');
  });

  /**
   * Showing the cook's rest in the field is not the pitmaster writing a record:
   * a step that was opened and left again has nothing to save, and a document
   * written from the step's own defaults would be a wrap-up plan and notes
   * nobody typed — or, when the write fails, a snackbar about an edit that was
   * never made.
   */
  test('writes no post-smoke document for a step that was only opened and left', async () => {
    const backend = pulledCook();
    backend.store.postSmoke.current = { restTime: '', steps: [''], notes: '' };

    const { unmount } = renderStep(backend);

    await screen.findByTestId('rest-timer-card');
    // The cook's hour is what the field reads, even though the record it is
    // saved in carries no rest of its own yet.
    expect(screen.getByTestId('postsmoke-rest-time-input')).toHaveValue('01:00');

    unmount();

    await waitFor(() => expect(backend.store.smoke.records['cook-1'].restMinutes).toBe(60));
    expect(
      backend.requests.some(
        request => request.method === 'post' && request.path === 'postSmoke/current'
      )
    ).toBe(false);
    expect(screen.queryByText('Could not save post-smoke details.')).not.toBeInTheDocument();
  });

  /**
   * The rest is one value, whichever side it was written from: a record made
   * before the planner existed — or on a device that never opened it — carries
   * the only rest anybody set, and the planner has to be told about it rather
   * than left disagreeing with the record until somebody retypes the field.
   */
  test('makes the record’s own rest the cook’s canonical one when the cook has none', async () => {
    const backend = pulledCook({ restMinutes: null });

    const { unmount } = renderStep(backend);

    // Counted from the record's hour and a half, ten minutes in.
    expect(await screen.findByTestId('rest-timer-remaining')).toHaveTextContent('1:20:00');
    expect(screen.getByTestId('postsmoke-rest-time-input')).toHaveValue('01:30');

    unmount();

    await waitFor(() => expect(backend.store.smoke.records['cook-1'].restMinutes).toBe(90));
  });

  /**
   * Neither side carries a rest, and "no rest at all" is not what that means:
   * a card that reads "Ready to slice" the moment the meat comes off is telling
   * the pitmaster to carve a brisket straight off the pit.
   */
  test('counts a sensible rest for a cook nobody has set one for', async () => {
    const backend = pulledCook({ restMinutes: null });
    backend.store.postSmoke.current = { restTime: '', steps: [''], notes: '' };

    renderStep(backend);

    expect(await screen.findByTestId('rest-timer-remaining')).toHaveTextContent('20:00');
    expect(screen.getByTestId('postsmoke-rest-time-input')).toHaveValue('');
  });

  test('shows no rest timer for a cook that was never pulled', async () => {
    renderStep(pulledCook({ pullAt: null }));

    expect(await screen.findByDisplayValue('Post-smoke notes')).toBeInTheDocument();
    expect(screen.queryByTestId('rest-timer-card')).not.toBeInTheDocument();
  });
});
