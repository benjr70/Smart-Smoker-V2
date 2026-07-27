import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  test('persists a weight typed into the addressable weight field', async () => {
    // The Name and Weight inputs render with the same DOM id, so neither their
    // label nor their id identifies one of them; each is addressed by its own
    // test id (which is also how the e2e journey drives the wizard).
    const backend = createFakeBackend({ preSmoke: { current: seededPreSmoke } });

    const { unmount } = renderStep(backend);

    const nameField = await screen.findByDisplayValue('Test Smoke');
    fireEvent.change(screen.getByTestId('presmoke-weight-input'), { target: { value: '12' } });
    expect(nameField).toHaveValue('Test Smoke');

    unmount();

    await waitFor(() => expect(backend.store.preSmoke.current?.weight.weight).toBe(12));
  });

  test('persists a custom meat type typed into the addressable meat-type field', async () => {
    // The meat type is a free-solo autocomplete: a pitmaster may type a cut that
    // is not in the suggestion list at all, and that string must be what gets
    // saved. The input is addressed by test id (as the e2e journey does) because
    // the autocomplete wraps its input in MUI markup.
    const backend = createFakeBackend({ preSmoke: { current: seededPreSmoke } });

    const { unmount } = renderStep(backend);

    await screen.findByDisplayValue('Test Smoke');
    fireEvent.change(screen.getByTestId('presmoke-meat-type-input'), {
      target: { value: 'Wagyu Chuck Roll' },
    });

    unmount();

    await waitFor(() => expect(backend.store.preSmoke.current?.meatType).toBe('Wagyu Chuck Roll'));
  });

  test('persists a weight unit switched from the LB default to OZ', async () => {
    // Small cuts are recorded in ounces. The unit control is a select whose
    // label ("Age", a copy/paste leftover) says nothing about what it does, so
    // the control and its options carry test ids.
    const backend = createFakeBackend({ preSmoke: { current: seededPreSmoke } });

    const { unmount } = renderStep(backend);

    await screen.findByDisplayValue('Test Smoke');
    fireEvent.mouseDown(screen.getByTestId('presmoke-weight-unit-select'));
    fireEvent.click(screen.getByTestId('presmoke-weight-unit-option-OZ'));
    expect(screen.getByTestId('presmoke-weight-unit-select')).toHaveTextContent('OZ');

    unmount();

    await waitFor(() => expect(backend.store.preSmoke.current?.weight.unit).toBe(WeightUnits.OZ));
  });

  test('adds, fills and removes prep-step rows, persisting the survivors in order', async () => {
    // Prep steps are a dynamic list: every row looks the same to a label-based
    // query, so each row and its controls carry test ids scoped by the row.
    const backend = createFakeBackend({
      preSmoke: { current: { ...seededPreSmoke, steps: ['Step 1'] } },
    });

    const { unmount } = renderStep(backend);

    await screen.findByDisplayValue('Test Smoke');
    const rows = () => screen.getAllByTestId('presmoke-step-row');
    const stepInput = (index: number) => within(rows()[index]).getByTestId('presmoke-step-input');
    const addRow = () =>
      fireEvent.click(within(rows()[rows().length - 1]).getByTestId('presmoke-step-add-button'));

    fireEvent.change(stepInput(0), { target: { value: 'Trim the fat' } });
    addRow();
    fireEvent.change(stepInput(1), { target: { value: 'Dry brine overnight' } });
    addRow();
    fireEvent.change(stepInput(2), { target: { value: 'Rub two hours ahead' } });

    fireEvent.click(within(rows()[1]).getByTestId('presmoke-step-remove-button'));
    expect(rows()).toHaveLength(2);

    unmount();

    await waitFor(() =>
      expect(backend.store.preSmoke.current?.steps).toEqual(['Trim the fat', 'Rub two hours ahead'])
    );
  });

  test('persists multiline notes typed into the addressable notes field', async () => {
    // Notes are free text spanning several lines, and "Notes" is a label the
    // post-smoke step reuses — so the field is addressed by test id.
    const backend = createFakeBackend({ preSmoke: { current: seededPreSmoke } });

    const { unmount } = renderStep(backend);

    await screen.findByDisplayValue('Test Smoke');
    fireEvent.change(screen.getByTestId('presmoke-notes-input'), {
      target: { value: 'Picked up at the butcher\nDry brined overnight' },
    });

    unmount();

    await waitFor(() =>
      expect(backend.store.preSmoke.current?.notes).toBe(
        'Picked up at the butcher\nDry brined overnight'
      )
    );
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
