import '@testing-library/jest-dom';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../../api';
import { createFakeBackend, FakeBackend } from '../../../api/fakeBackend';
import { PreSmoke } from '../../../api/types';
import { DesignSurface, appTheme } from '../../../theme';
import {
  FLASH_MS,
  TOAST_MS,
  VoiceFillPortsProvider,
  createFakeExtractor,
  createFakeSpeech,
} from '../../../voiceFill';
import { WeightUnits } from '../../common/interfaces/enums';
import { PreSmokeStep } from './preSmokeStep';

const seededPreSmoke: PreSmoke = {
  name: 'Test Smoke',
  meatType: 'Ribs',
  weight: { weight: 10, unit: WeightUnits.LB },
  steps: ['Step 1'],
  notes: '',
};

const TRANSCRIPT = 'Sixteen pound brisket. Trimmed the fat cap, then mustard binder.';

/** What the scripted model makes of {@link TRANSCRIPT}. */
const RAW = {
  meatType: 'brisket',
  weight: 16,
  steps: ['trimmed the fat cap', 'mustard binder'],
};

interface Script {
  transcript?: string;
  raw?: unknown;
  /** How long each scripted word takes to arrive, in ms. */
  wordIntervalMs?: number;
  /** How long the scripted model takes to answer, in ms. */
  delayMs?: number;
}

/**
 * The step as the application root mounts it, with Voice Fill's two models
 * replaced by scripted ones behind the same ports.
 */
const renderStep = (backend: FakeBackend, script: Script = {}) => {
  const client = createApiClient(backend);
  return render(
    <CssVarsProvider theme={appTheme}>
      <DesignSurface>
        <ApiClientProvider client={client}>
          <SnackbarProvider>
            <VoiceFillPortsProvider
              speech={createFakeSpeech({
                transcript: script.transcript ?? TRANSCRIPT,
                wordIntervalMs: script.wordIntervalMs ?? 1,
              })}
              extractor={createFakeExtractor({
                raw: script.raw ?? RAW,
                delayMs: script.delayMs,
              })}
            >
              <PreSmokeStep nextButton={<button data-testid="next-button">Next</button>} />
            </VoiceFillPortsProvider>
          </SnackbarProvider>
        </ApiClientProvider>
      </DesignSurface>
    </CssVarsProvider>
  );
};

const voiceFillButton = () => screen.queryByRole('button', { name: 'Voice fill' });
const stepValues = () =>
  screen.getAllByTestId('presmoke-step-input').map(input => (input as HTMLTextAreaElement).value);
const row = (label: RegExp) => screen.getByRole('checkbox', { name: label });

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
  await screen.findByDisplayValue('Test Smoke');
  await tap(screen.getByRole('button', { name: 'Voice fill' }));
  await tap(await screen.findByRole('button', { name: 'Done talking' }));
};

describe('Voice Fill on the pre-smoke screen', () => {
  test('is not offered where no models are provided', async () => {
    const backend = createFakeBackend({ preSmoke: { current: seededPreSmoke } });
    const client = createApiClient(backend);

    render(
      <CssVarsProvider theme={appTheme}>
        <DesignSurface>
          <ApiClientProvider client={client}>
            <PreSmokeStep nextButton={<button>Next</button>} />
          </ApiClientProvider>
        </DesignSurface>
      </CssVarsProvider>
    );

    await screen.findByDisplayValue('Test Smoke');
    expect(voiceFillButton()).not.toBeInTheDocument();
  });

  test('tapping Voice fill opens the sheet listening, with the hint, the live transcript and level bars', async () => {
    const backend = createFakeBackend({ preSmoke: { current: seededPreSmoke } });
    renderStep(backend);
    await screen.findByDisplayValue('Test Smoke');

    await tap(screen.getByRole('button', { name: 'Voice fill' }));

    const sheet = await screen.findByRole('dialog', { name: 'Voice fill Pre-smoke' });
    expect(within(sheet).getByRole('heading', { name: 'Listening…' })).toBeInTheDocument();
    expect(
      within(sheet).getByText(
        'Talk through it naturally — name, meat type, weight, unit, prep steps.'
      )
    ).toBeInTheDocument();
    expect(within(sheet).getByTestId('voice-fill-level-bars')).toBeInTheDocument();
    // The words arrive as they are spoken.
    expect(await within(sheet).findByText(TRANSCRIPT)).toBeInTheDocument();
    // The button is out of the way for as long as the sheet is up.
    expect(voiceFillButton()).not.toBeInTheDocument();
  });

  test('Done talking shows the quoted transcript and a spinner, and names no model', async () => {
    const backend = createFakeBackend({ preSmoke: { current: seededPreSmoke } });
    renderStep(backend, { delayMs: 60_000 });

    await ramble();

    const sheet = await screen.findByRole('dialog');
    expect(
      await within(sheet).findByRole('heading', { name: 'Filling in fields…' })
    ).toBeInTheDocument();
    expect(await within(sheet).findByText(`“${TRANSCRIPT}”`)).toBeInTheDocument();
    expect(within(sheet).getByRole('progressbar')).toBeInTheDocument();
    expect(within(sheet).getByText('Reading it…')).toBeInTheDocument();
    expect(sheet).not.toHaveTextContent(/gemma|moonshine|whisper|qwen/i);
  });

  test('the review list shows one ticked row per change, the new value and the old one struck through', async () => {
    const backend = createFakeBackend({ preSmoke: { current: seededPreSmoke } });
    renderStep(backend);

    await ramble();

    expect(await screen.findByRole('heading', { name: 'Found 3 fields' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    screen.getAllByRole('checkbox').forEach(box => expect(box).toBeChecked());

    const meat = row(/Meat type/);
    expect(within(meat).getByText('Brisket')).toBeInTheDocument();
    expect(within(meat).getByText('Ribs')).toHaveStyle('text-decoration: line-through');

    const weight = row(/Weight/);
    expect(within(weight).getByText('16 LB')).toBeInTheDocument();
    expect(within(weight).getByText('10 LB')).toHaveStyle('text-decoration: line-through');

    // A step list is added to, so its row shows the added steps and strikes nothing.
    const steps = row(/Prep steps/);
    expect(within(steps).getByText('Trimmed the fat cap')).toBeInTheDocument();
    expect(within(steps).getByText('Mustard binder')).toBeInTheDocument();
    expect(within(steps).queryByText('Step 1')).not.toBeInTheDocument();

    // Nothing is written before Fill.
    expect(screen.getByTestId('presmoke-weight-input')).toHaveValue(10);
  });

  test('Fill writes the scripted values into the form, closes the sheet, and saves them like typed ones', async () => {
    const backend = createFakeBackend({ preSmoke: { current: seededPreSmoke } });
    const { unmount } = renderStep(backend);
    await ramble();

    fireEvent.click(await screen.findByRole('button', { name: 'Fill 3 fields' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('presmoke-meat-type-input')).toHaveValue('Brisket');
    expect(screen.getByTestId('presmoke-weight-input')).toHaveValue(16);
    expect(stepValues()).toEqual(['Step 1', 'Trimmed the fat cap', 'Mustard binder']);
    // A name somebody chose is not replaced by one nobody spoke.
    expect(screen.getByTestId('presmoke-name-input')).toHaveValue('Test Smoke');

    unmount();
    await waitFor(() => expect(backend.store.preSmoke.current?.meatType).toBe('Brisket'));
    expect(backend.store.preSmoke.current?.weight).toEqual({ weight: 16, unit: WeightUnits.LB });
    expect(backend.store.preSmoke.current?.steps).toEqual([
      'Step 1',
      'Trimmed the fat cap',
      'Mustard binder',
    ]);
  });

  test('an unticked row leaves its field unchanged', async () => {
    const backend = createFakeBackend({ preSmoke: { current: seededPreSmoke } });
    renderStep(backend);
    await ramble();
    await screen.findByRole('heading', { name: 'Found 3 fields' });

    fireEvent.click(row(/Weight/));
    expect(row(/Weight/)).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Fill 2 fields' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('presmoke-weight-input')).toHaveValue(10);
    expect(screen.getByTestId('presmoke-meat-type-input')).toHaveValue('Brisket');
    expect(screen.getByRole('status')).toHaveTextContent('Filled 2 fields by voice');
  });

  test('Fill is not offered once every row is unticked', async () => {
    const backend = createFakeBackend({ preSmoke: { current: seededPreSmoke } });
    renderStep(backend, { raw: { weight: 16 } });
    await ramble();
    await screen.findByRole('heading', { name: 'Found 1 field' });

    fireEvent.click(row(/Weight/));

    expect(screen.getByRole('button', { name: 'Fill 0 fields' })).toBeDisabled();
  });

  test('a name built from the meat type goes with it, so Fill and the toast count what is written', async () => {
    // Nothing on the screen yet: the Ramble's meat is all a name can be built from.
    const backend = createFakeBackend({});
    renderStep(backend);
    await screen.findByTestId('presmoke-name-input');
    await tap(screen.getByRole('button', { name: 'Voice fill' }));
    await tap(await screen.findByRole('button', { name: 'Done talking' }));
    await screen.findByRole('heading', { name: 'Found 4 fields' });

    fireEvent.click(row(/Meat type/));

    // The name cannot be written without the meat it was built from.
    expect(row(/Meat type/)).not.toBeChecked();
    expect(row(/Name/)).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Fill 2 fields' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Filled 2 fields by voice');
    expect(screen.getByTestId('presmoke-name-input')).toHaveValue('');
    expect(screen.getByTestId('presmoke-meat-type-input')).toHaveValue('');
    expect(screen.getByTestId('presmoke-weight-input')).toHaveValue(16);
  });

  test('ticking a name built from the meat type ticks the meat type with it', async () => {
    const backend = createFakeBackend({});
    renderStep(backend, { raw: { meatType: 'brisket' } });
    await screen.findByTestId('presmoke-name-input');
    await tap(screen.getByRole('button', { name: 'Voice fill' }));
    await tap(await screen.findByRole('button', { name: 'Done talking' }));
    await screen.findByRole('heading', { name: 'Found 2 fields' });

    fireEvent.click(row(/Meat type/));
    expect(screen.getByRole('button', { name: 'Fill 0 fields' })).toBeDisabled();
    fireEvent.click(row(/Name/));

    expect(row(/Meat type/)).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Fill 2 fields' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('presmoke-meat-type-input')).toHaveValue('Brisket');
    // The weekday is whichever one the suite is run on.
    expect((screen.getByTestId('presmoke-name-input') as HTMLInputElement).value).toMatch(
      /day Brisket$/
    );
  });

  test('Undo on the toast restores every changed value', async () => {
    const backend = createFakeBackend({ preSmoke: { current: seededPreSmoke } });
    const { unmount } = renderStep(backend);
    await ramble();
    fireEvent.click(await screen.findByRole('button', { name: 'Fill 3 fields' }));

    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('Filled 3 fields by voice');
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }));

    expect(screen.getByTestId('presmoke-meat-type-input')).toHaveValue('Ribs');
    expect(screen.getByTestId('presmoke-weight-input')).toHaveValue(10);
    expect(stepValues()).toEqual(['Step 1']);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    // The form is back to what the backend holds, so there is nothing to save.
    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(backend.store.preSmoke.current).toEqual(seededPreSmoke);
  });

  test('the button is hidden while the sheet or the toast is up, and back once the toast has gone', async () => {
    const backend = createFakeBackend({ preSmoke: { current: seededPreSmoke } });
    renderStep(backend);
    await screen.findByDisplayValue('Test Smoke');
    expect(voiceFillButton()).toBeInTheDocument();

    await tap(screen.getByRole('button', { name: 'Voice fill' }));
    await screen.findByRole('dialog');
    expect(voiceFillButton()).not.toBeInTheDocument();

    await tap(screen.getByRole('button', { name: 'Done talking' }));
    jest.useFakeTimers();
    try {
      fireEvent.click(await screen.findByRole('button', { name: 'Fill 3 fields' }));
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(voiceFillButton()).not.toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(TOAST_MS);
      });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(voiceFillButton()).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test('the filled fields flash, and stop', async () => {
    const backend = createFakeBackend({ preSmoke: { current: seededPreSmoke } });
    renderStep(backend);
    await ramble();
    const fill = await screen.findByRole('button', { name: 'Fill 3 fields' });
    // A flash is drawn on the box around a field, which has no role and no
    // words of its own to be found by: the attribute is all there is.
    const flashing = () =>
      // eslint-disable-next-line testing-library/no-node-access
      Array.from(document.querySelectorAll('[data-voice-filled]')).map(element =>
        element.getAttribute('data-voice-filled')
      );
    expect(flashing()).toEqual([]);

    jest.useFakeTimers();
    try {
      fireEvent.click(fill);
      // The weight and its unit are one answer, so they flash together; the
      // name and the notes were not filled and do not flash.
      expect(flashing()).toEqual(['meatType', 'weight', 'weight', 'steps']);

      act(() => {
        jest.advanceTimersByTime(FLASH_MS);
      });
      expect(flashing()).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  test('closing the sheet changes nothing and discards the transcript', async () => {
    const backend = createFakeBackend({ preSmoke: { current: seededPreSmoke } });
    // Words slow enough that none of the next Ramble has been heard by the
    // time the sheet is looked at again.
    renderStep(backend, { wordIntervalMs: 60_000 });
    await ramble();
    await screen.findByRole('heading', { name: 'Found 3 fields' });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText(TRANSCRIPT, { exact: false })).not.toBeInTheDocument();
    expect(screen.getByTestId('presmoke-meat-type-input')).toHaveValue('Ribs');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    // The next Ramble starts from nothing.
    await tap(screen.getByRole('button', { name: 'Voice fill' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Start talking…')).toBeInTheDocument();
  });
});
