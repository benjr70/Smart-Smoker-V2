import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../../api';
import { createFakeBackend, FakeBackend } from '../../../api/fakeBackend';
import { PreSmoke } from '../../../api/types';
import { WeightUnits } from '../../common/interfaces/enums';
import { PreSmokeStep } from './preSmokeStep';

const seededPreSmoke: PreSmoke = {
  name: 'Test Smoke',
  meatType: 'Brisket',
  weight: { weight: 10, unit: WeightUnits.LB },
  steps: ['Step 1', 'Step 2'],
  notes: 'Test notes',
};

const renderStep = (backend: FakeBackend) => {
  const client = createApiClient(backend);
  const nextButton = <button data-testid="next-button">Next</button>;
  return render(
    <ApiClientProvider client={client}>
      <SnackbarProvider>
        <PreSmokeStep nextButton={nextButton} />
      </SnackbarProvider>
    </ApiClientProvider>
  );
};

describe('PreSmokeStep', () => {
  test('loads the seeded pre-smoke from the injected client on mount', async () => {
    const backend = createFakeBackend({ preSmoke: { current: seededPreSmoke } });

    renderStep(backend);

    expect(await screen.findByDisplayValue('Test Smoke')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test notes')).toBeInTheDocument();
    expect(screen.getByTestId('next-button')).toBeInTheDocument();
  });

  test('edits fields and persists the latest value to the backend on unmount', async () => {
    const backend = createFakeBackend({ preSmoke: { current: seededPreSmoke } });

    const { unmount } = renderStep(backend);

    const nameField = await screen.findByDisplayValue('Test Smoke');
    fireEvent.change(nameField, { target: { value: 'New Smoke Name' } });
    expect(nameField).toHaveValue('New Smoke Name');

    unmount();

    await waitFor(() => expect(backend.store.preSmoke.current?.name).toBe('New Smoke Name'));
  });

  test('edits weight, notes and steps and persists them together on unmount', async () => {
    const backend = createFakeBackend({ preSmoke: { current: seededPreSmoke } });

    const { unmount } = renderStep(backend);

    const weightField = await screen.findByDisplayValue('10');
    fireEvent.change(weightField, { target: { value: '15' } });

    const notesField = screen.getByDisplayValue('Test notes');
    fireEvent.change(notesField, { target: { value: 'Updated notes' } });

    const firstStep = screen.getByDisplayValue('Step 1');
    fireEvent.change(firstStep, { target: { value: 'Trim the fat' } });

    unmount();

    await waitFor(() => expect(backend.store.preSmoke.current?.notes).toBe('Updated notes'));
    expect(backend.store.preSmoke.current?.weight.weight).toBe(15);
    expect(backend.store.preSmoke.current?.steps).toContain('Trim the fat');
  });

  test('renders empty fields for a blank current pre-smoke document', async () => {
    const backend = createFakeBackend({
      preSmoke: {
        current: {
          name: '',
          meatType: '',
          weight: { unit: WeightUnits.LB },
          steps: [''],
          notes: '',
        },
      },
    });

    renderStep(backend);

    await waitFor(() => {
      const nameField = screen.getByTestId('presmoke-name-input');
      expect(nameField).toHaveValue('');
    });
  });

  test('raises the snackbar when loading the pre-smoke fails', async () => {
    const backend = createFakeBackend({ preSmoke: { current: seededPreSmoke } });
    backend.injectFault({ method: 'get', path: 'presmoke/', status: 500 });

    renderStep(backend);

    expect(await screen.findByText('Could not load pre-smoke details.')).toBeInTheDocument();
  });
});
