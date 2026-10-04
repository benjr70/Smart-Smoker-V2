import '@testing-library/jest-dom';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../../api';
import { createFakeBackend, FakeBackend } from '../../../api/fakeBackend';
import { PostSmoke, Smoke } from '../../../api/types';
import { DesignSurface, appTheme } from '../../../theme';
import { VoiceFillPortsProvider, createFakeExtractor, createFakeSpeech } from '../../../voiceFill';
import { WeightUnits } from '../../common/interfaces/enums';
import { PostSmokeStep } from './PostSmokeStep';

const seededPostSmoke: PostSmoke = {
  restTime: '01:00',
  steps: ['Rest wrapped'],
  notes: 'Bark set early.',
};

const TRANSCRIPT =
  'Rested an hour and fifteen. Pulled the bone, then sliced against the grain. The flat was a touch dry.';

/** What the scripted model makes of {@link TRANSCRIPT}, the existing Notes merged in. */
const RAW = {
  restMinutes: 75,
  steps: ['pulled the bone', 'sliced against the grain'],
  notes: 'Bark set early. The flat was a touch dry.',
};

/**
 * A session whose cook has been pulled an hour's rest into the plan, and whose
 * post-smoke record says the same hour in its own words.
 */
const pulledCook = (smoke: Partial<Smoke> = {}, postSmoke: PostSmoke = seededPostSmoke) =>
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
          pullAt: new Date(Date.now() - 10 * 60_000).toISOString() as unknown as Date,
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
    postSmoke: { current: postSmoke },
  });

/**
 * The step as the application root mounts it, with Voice Fill's two models
 * replaced by scripted ones behind the same ports.
 */
const renderStep = (backend: FakeBackend, raw: unknown = RAW) =>
  render(
    <CssVarsProvider theme={appTheme}>
      <DesignSurface>
        <ApiClientProvider client={createApiClient(backend)}>
          <SnackbarProvider>
            <VoiceFillPortsProvider
              speech={createFakeSpeech({ transcript: TRANSCRIPT, wordIntervalMs: 1 })}
              extractor={createFakeExtractor({ raw })}
            >
              <PostSmokeStep nextButton={<button data-testid="next-button">Finish</button>} />
            </VoiceFillPortsProvider>
          </SnackbarProvider>
        </ApiClientProvider>
      </DesignSurface>
    </CssVarsProvider>
  );

const restTime = () => screen.getByTestId('postsmoke-rest-time-input');
const notes = () => screen.getByTestId('postsmoke-notes-input');
const stepValues = () =>
  screen.getAllByTestId('postsmoke-step-input').map(input => (input as HTMLTextAreaElement).value);

/**
 * A tap, and whatever the models answer to it straight away: the session hears
 * from its ports a turn after the tap that asked them.
 */
const tap = async (element: HTMLElement) => {
  // The click is not what needs the act: the answer that follows it is, and it
  // arrives after the click has returned.
  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async () => {
    fireEvent.click(element);
  });
};

/** Taps Voice fill, lets the Ramble play, and ends it. */
const ramble = async () => {
  await screen.findByDisplayValue('Bark set early.');
  await tap(screen.getByRole('button', { name: 'Voice fill' }));
  await tap(await screen.findByRole('button', { name: 'Done talking' }));
};

describe('Voice Fill on the post-smoke screen', () => {
  test('is not offered where no models are provided', async () => {
    render(
      <CssVarsProvider theme={appTheme}>
        <DesignSurface>
          <ApiClientProvider client={createApiClient(pulledCook())}>
            <PostSmokeStep nextButton={<button>Finish</button>} />
          </ApiClientProvider>
        </DesignSurface>
      </CssVarsProvider>
    );

    await screen.findByDisplayValue('Bark set early.');
    expect(screen.queryByRole('button', { name: 'Voice fill' })).not.toBeInTheDocument();
  });

  test('the sheet names the screen and the fields it takes, and the review list shows what will be written', async () => {
    renderStep(pulledCook());
    await screen.findByDisplayValue('Bark set early.');

    await tap(screen.getByRole('button', { name: 'Voice fill' }));
    const sheet = await screen.findByRole('dialog', { name: 'Voice fill Post-smoke' });
    expect(within(sheet).getByText(/rest time, post-smoke steps/)).toBeInTheDocument();
    await tap(within(sheet).getByRole('button', { name: 'Done talking' }));

    expect(await screen.findByRole('heading', { name: 'Found 3 fields' })).toBeInTheDocument();
    // The rest being replaced is the one on screen — the cook's.
    const rest = screen.getByRole('checkbox', { name: /Rest time/ });
    expect(within(rest).getByText('01:15')).toBeInTheDocument();
    expect(within(rest).getByText('01:00')).toHaveStyle('text-decoration: line-through');
    // Nothing is written before Fill.
    expect(restTime()).toHaveValue('01:00');
  });

  test('a rest the cook already has is not offered again', async () => {
    // The record's own words say an hour and a half; the rest on screen, the
    // cook's, is the spoken hour already.
    renderStep(pulledCook({}, { ...seededPostSmoke, restTime: '01:30' }), {
      restMinutes: 60,
      steps: ['sliced against the grain'],
    });
    await ramble();

    expect(await screen.findByRole('heading', { name: 'Found 1 field' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Post-smoke steps/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Rest time/ })).not.toBeInTheDocument();
  });

  test('the filled fields flash', async () => {
    renderStep(pulledCook());
    await ramble();
    fireEvent.click(await screen.findByRole('button', { name: 'Fill 3 fields' }));

    // A flash is drawn on the box around a field, which has no role and no
    // words of its own to be found by: the attribute is all there is.
    expect(
      // eslint-disable-next-line testing-library/no-node-access
      Array.from(document.querySelectorAll('[data-voice-filled]')).map(element =>
        element.getAttribute('data-voice-filled')
      )
    ).toEqual(['restTime', 'steps', 'notes']);
  });

  test('a Ramble fills the rest time, adds its steps and rewrites Notes, and they are saved like typed ones', async () => {
    const backend = pulledCook();
    const { unmount } = renderStep(backend);
    await ramble();

    fireEvent.click(await screen.findByRole('button', { name: 'Fill 3 fields' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(restTime()).toHaveValue('01:15');
    expect(stepValues()).toEqual(['Rest wrapped', 'Pulled the bone', 'Sliced against the grain']);
    expect(notes()).toHaveValue('Bark set early. The flat was a touch dry.');

    unmount();
    await waitFor(() =>
      expect(backend.store.postSmoke.current).toEqual({
        restTime: '01:15',
        steps: ['Rest wrapped', 'Pulled the bone', 'Sliced against the grain'],
        notes: 'Bark set early. The flat was a touch dry.',
      })
    );
  });

  test('the spoken rest is the rest the Serve Plan reads, at once and once saved', async () => {
    const backend = pulledCook();
    const { unmount } = renderStep(backend);
    await ramble();
    // Ten minutes into the hour the plan carries.
    expect(screen.getByTestId('rest-timer-remaining')).toHaveTextContent(/^(50:00|49:5\d)$/);

    fireEvent.click(await screen.findByRole('button', { name: 'Fill 3 fields' }));

    // The countdown is against the spoken rest as soon as it is filled, as it
    // is against a typed one: an hour and a quarter, ten minutes in.
    expect(screen.getByTestId('rest-timer-remaining')).toHaveTextContent(/^1:0[45]:\d\d$/);

    unmount();
    await waitFor(() => expect(backend.store.smoke.records['cook-1'].restMinutes).toBe(75));
    expect(
      backend.requests.filter(request => request.path === 'smoke/current/serve-plan')
    ).toHaveLength(1);
  });

  /** Fills everything the Ramble proposed, then takes it back from the toast. */
  const fillAndUndo = async () => {
    await ramble();
    fireEvent.click(await screen.findByRole('button', { name: 'Fill 3 fields' }));
    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('Filled 3 fields by voice');
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }));
  };

  /** Leaves the step, and gives whatever it would save the turn to be sent in. */
  const leave = async (unmount: () => void) => {
    unmount();
    await act(async () => {
      await Promise.resolve();
    });
  };

  test('Undo restores the rest time, the steps and Notes, and the rest the Serve Plan reads', async () => {
    const backend = pulledCook();
    const { unmount } = renderStep(backend);

    await fillAndUndo();

    expect(restTime()).toHaveValue('01:00');
    expect(stepValues()).toEqual(['Rest wrapped']);
    expect(notes()).toHaveValue('Bark set early.');
    expect(screen.getByTestId('rest-timer-remaining')).toHaveTextContent(/^(50:00|49:5\d)$/);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    // The step is back to what the backend holds, so there is nothing to save:
    // neither the record nor the cook's rest is written.
    await leave(unmount);
    expect(backend.store.postSmoke.current).toEqual(seededPostSmoke);
    expect(backend.store.smoke.records['cook-1'].restMinutes).toBe(60);
    expect(backend.requests.filter(request => request.method !== 'get')).toEqual([]);
  });

  /**
   * The rest on screen is the cook's, and the record keeps words of its own for
   * it. Undo puts back both as they were — not the rest that was on screen
   * written into the record, which would be an edit nobody made.
   */
  test('Undo puts the record’s own words for the rest back where they differ from the cook’s', async () => {
    const backend = pulledCook({}, { ...seededPostSmoke, restTime: '01:30' });
    const { unmount } = renderStep(backend);

    await fillAndUndo();

    // The cook's hour, as before the fill, and still counted from.
    expect(restTime()).toHaveValue('01:00');
    await leave(unmount);
    expect(backend.store.postSmoke.current?.restTime).toBe('01:30');
    expect(backend.store.smoke.records['cook-1'].restMinutes).toBe(60);
    expect(backend.requests.filter(request => request.method !== 'get')).toEqual([]);
  });

  test('Undo leaves a cook nobody had set a rest for without one', async () => {
    const backend = pulledCook({ restMinutes: null }, { ...seededPostSmoke, restTime: '' });
    const { unmount } = renderStep(backend);

    await fillAndUndo();

    expect(restTime()).toHaveValue('');
    await leave(unmount);
    expect(backend.store.smoke.records['cook-1'].restMinutes).toBeNull();
    expect(backend.requests.filter(request => request.method !== 'get')).toEqual([]);
  });

  test('Undo leaves alone a rest typed over the spoken one', async () => {
    const backend = pulledCook();
    const { unmount } = renderStep(backend);
    await ramble();
    fireEvent.click(await screen.findByRole('button', { name: 'Fill 3 fields' }));
    const toast = await screen.findByRole('status');

    fireEvent.input(restTime(), { target: { value: '0200' } });
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }));

    // The steps and Notes still stand as filled, so they are taken back; the
    // rest is the cook's own hand by now, and is not.
    expect(restTime()).toHaveValue('02:00');
    expect(stepValues()).toEqual(['Rest wrapped']);
    unmount();
    await waitFor(() => expect(backend.store.smoke.records['cook-1'].restMinutes).toBe(120));
    expect(backend.store.postSmoke.current?.restTime).toBe('02:00');
  });
});
