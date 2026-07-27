import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SmokeStepView } from './smokeStep';
import { SmokeSessionProvider } from 'smoke-session/src/react';
import { SessionConfig, SmokeProfile } from 'smoke-session/src';
import { FakeCloudSocket, FakeSessionApi, SteppingClock } from 'smoke-session/src/testing';

/**
 * The smoke step's editable fields, addressed the way the full-smoke e2e journey
 * addresses them: by stable test id, through *real* Material-UI.
 *
 * Its sibling `smokeStep.test.tsx` stubs `@mui/material` to drive the view's
 * session wiring, which is the right trade there but the wrong one here — a test
 * id read off a stub proves only that the stub forwarded it. These fields are
 * wrapped by MUI (an `Input`'s inner element, an `Autocomplete`'s `renderInput`),
 * so whether the id actually lands on the element a browser types into is
 * exactly what needs proving. Hence real MUI, and only the chart is stubbed: D3
 * draws SVG that jsdom cannot exercise.
 */
jest.mock('temperaturechart/src/tempChart', () => ({
  __esModule: true,
  default: () => <div data-testid="temp-chart" />,
}));

// The package's `flushPromises` uses `setImmediate`, absent from the frontend's
// jsdom environment; a `setTimeout(0)` macrotask drains the store's
// fire-and-forget startup loads just the same.
const flushPromises = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

const nextButton = <button data-testid="next-button">Next</button>;

/** The profile a smoke already under way has saved — every field at its default. */
const savedProfile: SmokeProfile = {
  chamberName: 'Chamber',
  probe1Name: 'Probe 1',
  probe2Name: 'Probe 2',
  probe3Name: 'Probe 3',
  woodType: '',
  notes: '',
};

/**
 * Render the step over the package's fakes (the real system boundaries: socket
 * and HTTP) with its saved profile already loaded, so edits made afterwards are
 * the only thing a save can carry.
 */
async function renderStep(): Promise<{ api: FakeSessionApi; unmount: () => void }> {
  const api = new FakeSessionApi().seedProfile(savedProfile);
  const config: SessionConfig = {
    role: 'monitor',
    socket: new FakeCloudSocket(),
    api,
    clock: new SteppingClock(),
  };
  const { unmount } = render(
    <SmokeSessionProvider config={config}>
      <SmokeStepView nextButton={nextButton} />
    </SmokeSessionProvider>
  );
  await act(async () => {
    await flushPromises();
  });
  return { api, unmount };
}

/** The profile the step persisted when it was left, or undefined if it saved none. */
function savedOnLeave(api: FakeSessionApi): SmokeProfile | undefined {
  return api.calls.find(call => call.method === 'saveProfile')?.args[0] as SmokeProfile | undefined;
}

describe('SmokeStepView editable fields', () => {
  test('persists a renamed chamber typed into the addressable chamber field', async () => {
    // Every name on this step is an unlabelled inline `Input` styled as a
    // heading — four fields a label-based query cannot tell apart — so each
    // carries a test id.
    const { api, unmount } = await renderStep();

    fireEvent.change(screen.getByTestId('smoke-chamber-name-input'), {
      target: { value: 'Offset Barrel' },
    });

    await act(async () => {
      unmount();
      await flushPromises();
    });

    await waitFor(() => expect(savedOnLeave(api)?.chamberName).toBe('Offset Barrel'));
  });

  test('persists all three probes renamed to what each one is measuring', async () => {
    // The three probes are interchangeable until they are named, and a rename
    // is only useful if it reaches the right probe — so all three are renamed
    // to distinct values in one go and each is asserted on its own field.
    const { api, unmount } = await renderStep();

    fireEvent.change(screen.getByTestId('smoke-probe1-name-input'), { target: { value: 'Point' } });
    fireEvent.change(screen.getByTestId('smoke-probe2-name-input'), { target: { value: 'Flat' } });
    fireEvent.change(screen.getByTestId('smoke-probe3-name-input'), {
      target: { value: 'Ambient' },
    });

    await act(async () => {
      unmount();
      await flushPromises();
    });

    await waitFor(() =>
      expect(savedOnLeave(api)).toMatchObject({
        probe1Name: 'Point',
        probe2Name: 'Flat',
        probe3Name: 'Ambient',
      })
    );
  });

  test('persists a wood type typed in free-solo that no suggestion offers', async () => {
    // Wood type is a free-solo autocomplete: whatever a pitmaster burns must be
    // recordable, including a wood the option list never suggests. Its input is
    // built by MUI inside `renderInput`, hence the test id on the params.
    const { api, unmount } = await renderStep();

    fireEvent.change(screen.getByTestId('smoke-wood-type-input'), {
      target: { value: 'Mesquite and Apple mix' },
    });

    await act(async () => {
      unmount();
      await flushPromises();
    });

    await waitFor(() => expect(savedOnLeave(api)?.woodType).toBe('Mesquite and Apple mix'));
  });

  test('persists multiline notes taken while the smoke runs', async () => {
    // Notes are what makes a cook reproducible, and they run to several lines.
    // "Notes" is a label the pre- and post-smoke steps use too, so the field is
    // addressed by test id rather than by label.
    const { api, unmount } = await renderStep();

    fireEvent.change(screen.getByTestId('smoke-notes-input'), {
      target: { value: 'Stall at 165F\nWrapped in butcher paper' },
    });

    await act(async () => {
      unmount();
      await flushPromises();
    });

    await waitFor(() =>
      expect(savedOnLeave(api)?.notes).toBe('Stall at 165F\nWrapped in butcher paper')
    );
  });
});
