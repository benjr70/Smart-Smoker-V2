import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../../api';
import { createFakeBackend, FakeBackend } from '../../../api/fakeBackend';
import { PostSmoke } from '../../../api/types';
import { PostSmokeStep } from './PostSmokeStep';

const seededPostSmoke: PostSmoke = {
  restTime: '01:30',
  steps: ['Rest wrapped', 'Slice'],
  notes: 'Post-smoke notes',
};

const renderStep = (backend: FakeBackend) => {
  const client = createApiClient(backend);
  const nextButton = <button data-testid="next-button">Next</button>;
  return render(
    <ApiClientProvider client={client}>
      <SnackbarProvider>
        <PostSmokeStep nextButton={nextButton} />
      </SnackbarProvider>
    </ApiClientProvider>
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

    const notesField = await screen.findByDisplayValue('Post-smoke notes');
    fireEvent.change(notesField, { target: { value: 'Updated notes' } });
    expect(notesField).toHaveValue('Updated notes');

    unmount();

    await waitFor(() => expect(backend.store.postSmoke.current?.notes).toBe('Updated notes'));
  });

  test('edits a step and persists the updated steps on unmount', async () => {
    const backend = createFakeBackend({ postSmoke: { current: seededPostSmoke } });

    const { unmount } = renderStep(backend);

    const firstStep = await screen.findByDisplayValue('Rest wrapped');
    fireEvent.change(firstStep, { target: { value: 'Rest in cooler' } });

    unmount();

    await waitFor(() => expect(backend.store.postSmoke.current?.steps).toContain('Rest in cooler'));
  });

  test('raises the snackbar when loading the post-smoke fails', async () => {
    const backend = createFakeBackend({ postSmoke: { current: seededPostSmoke } });
    backend.injectFault({ method: 'get', path: 'postSmoke/current', status: 500 });

    renderStep(backend);

    expect(await screen.findByText('Could not load post-smoke details.')).toBeInTheDocument();
  });
});
