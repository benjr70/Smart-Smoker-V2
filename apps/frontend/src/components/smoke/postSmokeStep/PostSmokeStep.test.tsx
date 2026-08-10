import '@testing-library/jest-dom';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../../api';
import { createFakeBackend, FakeBackend } from '../../../api/fakeBackend';
import { PostSmoke } from '../../../api/types';
import { DesignSurface, appTheme } from '../../../theme';
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
    // refuses the rest. The hint is what the design puts under the field.
    const backend = createFakeBackend({ postSmoke: { current: seededPostSmoke } });

    renderStep(backend);
    await screen.findByDisplayValue('01:30');

    const restTime = screen.getByTestId('postsmoke-rest-time-input');
    expect(screen.getByLabelText('Rest Time')).toBe(restTime);
    expect(screen.getByText('Rest Time')).toHaveStyle({ textTransform: 'uppercase' });
    expect(restTime).toHaveAccessibleDescription('Hours and minutes, as HH:MM');

    expect(screen.getByLabelText('Notes')).toBe(screen.getByTestId('postsmoke-notes-input'));
    expect(screen.getByText('Notes')).toHaveStyle({ textTransform: 'uppercase' });
  });

  test('raises the snackbar when loading the post-smoke fails', async () => {
    const backend = createFakeBackend({ postSmoke: { current: seededPostSmoke } });
    backend.injectFault({ method: 'get', path: 'postSmoke/current', status: 500 });

    renderStep(backend);

    expect(await screen.findByText('Could not load post-smoke details.')).toBeInTheDocument();
  });
});
