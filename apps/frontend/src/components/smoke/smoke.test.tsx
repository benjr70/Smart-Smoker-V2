/**
 * The smoke wizard: the design's sticky header and its three-segment step
 * control, around the three steps that were always there, and the advance-and-
 * finish flow through them.
 *
 * The steps themselves are the real ones, mounted over the fake backend, so
 * "leaving a step saves what was typed into it" is verified the way the user
 * experiences it — type, leave, come back, read it again — rather than by
 * watching for a save call. The one step stubbed out is the live smoke step:
 * it is a composition root that opens a websocket to the deployment, which is
 * the boundary this suite has no business reaching across. What it renders is
 * of no interest here; that it can be navigated to and away from is.
 *
 * This replaces two suites (`smoke.test.tsx` and a near-identical
 * `smoke-simple.test.tsx`) that asserted the same navigation and finish flow
 * twice over, each through a hand-written stand-in for every Material-UI
 * component the wizard used — including the stepper this shell removed, whose
 * class names one of them asserted on directly.
 */
import '@testing-library/jest-dom';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../api';
import { createFakeBackend, FakeBackend } from '../../api/fakeBackend';
import { DesignSurface, appTheme } from '../../theme';
import { WeightUnits } from '../common/interfaces/enums';
import { Smoke, delay } from './smoke';

jest.mock('./smokeStep/smokeStep', () => ({
  SmokeStep: ({ nextButton }: { nextButton: JSX.Element }) => (
    <div data-testid="smoke-step">{nextButton}</div>
  ),
}));

let backend: FakeBackend;

const renderWizard = () => {
  // A session already under way: both steps have a stored document, which is
  // what the save-on-leave needs — a step whose load failed deliberately writes
  // nothing back (see `useCurrentResource`), so a wizard over an empty backend
  // would be testing that safety rule rather than this shell.
  backend = createFakeBackend({
    state: { smokeId: 'test-id', smoking: true },
    smoke: { finish: { _id: 'test-id' } as never },
    preSmoke: {
      current: {
        name: '',
        meatType: '',
        weight: { unit: WeightUnits.LB },
        steps: [''],
        notes: '',
      },
    },
    postSmoke: { current: { restTime: '', steps: [''], notes: '' } },
  });

  return render(
    <CssVarsProvider theme={appTheme}>
      <DesignSurface>
        <ApiClientProvider client={createApiClient(backend)}>
          <SnackbarProvider>
            <Smoke />
          </SnackbarProvider>
        </ApiClientProvider>
      </DesignSurface>
    </CssVarsProvider>
  );
};

/** A step segment of the header's step control, by the step it selects. */
const segment = (label: 'Pre-Smoke' | 'Smoke' | 'Post-Smoke') =>
  screen.getByTestId(`smoke-step-${label}`);

/** The step's own primary action, whatever the step it is rendered in. */
const nextButton = () => screen.getByTestId('smoke-next-button');

/** Settle once the step that was just left has persisted its draft. */
const savedTo = (path: string): Promise<void> =>
  waitFor(() =>
    expect(
      backend.requests.some(request => request.method === 'post' && request.path === path)
    ).toBe(true)
  );

describe('the wizard header', () => {
  it('names the product and the session, and carries the flame badge', async () => {
    renderWizard();
    await screen.findByTestId('presmoke-name-input');

    const header = screen.getByTestId('smoke-header');
    expect(header).toHaveTextContent('SMART SMOKER');
    expect(header).toHaveTextContent('New Session');
    expect(within(header).getByTestId('smoke-header-badge')).toBeInTheDocument();
  });

  it('stays at the top of the screen while a step is scrolled', async () => {
    renderWizard();
    await screen.findByTestId('presmoke-name-input');

    const header = screen.getByTestId('smoke-header');
    expect(getComputedStyle(header).position).toBe('sticky');
    expect(getComputedStyle(header).top).toBe('0px');
    // The step control travels with the header: the step being edited has to
    // stay switchable however far down a step the user has scrolled.
    expect(within(header).getByRole('tablist')).toBeInTheDocument();
  });

  it('offers the steps as a segmented control rather than as the stepper it replaced', async () => {
    renderWizard();
    await screen.findByTestId('presmoke-name-input');

    // The stepper offered each step as a button of its own; the steps are now
    // segments of a tab list, and nothing on the screen offers them twice.
    expect(screen.getAllByRole('tab').map(step => step.textContent)).toEqual([
      'Pre-Smoke',
      'Smoke',
      'Post-Smoke',
    ]);
    ['Pre-Smoke', 'Smoke', 'Post-Smoke'].forEach(step => {
      expect(screen.queryByRole('button', { name: step })).not.toBeInTheDocument();
    });
  });
});

describe('the wizard step control', () => {
  it('shows the step whose segment was tapped', async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByTestId('presmoke-name-input');

    await user.click(segment('Post-Smoke'));
    expect(await screen.findByTestId('postsmoke-rest-time-input')).toBeInTheDocument();
    expect(screen.queryByTestId('presmoke-name-input')).not.toBeInTheDocument();

    await user.click(segment('Smoke'));
    expect(await screen.findByTestId('smoke-step')).toBeInTheDocument();

    await user.click(segment('Pre-Smoke'));
    expect(await screen.findByTestId('presmoke-name-input')).toBeInTheDocument();
  });

  it('marks the step being shown as the selected segment, and only that one', async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByTestId('presmoke-name-input');

    expect(segment('Pre-Smoke')).toHaveAttribute('aria-selected', 'true');
    expect(segment('Smoke')).toHaveAttribute('aria-selected', 'false');
    expect(segment('Post-Smoke')).toHaveAttribute('aria-selected', 'false');

    await user.click(segment('Post-Smoke'));

    await waitFor(() => expect(segment('Post-Smoke')).toHaveAttribute('aria-selected', 'true'));
    expect(segment('Pre-Smoke')).toHaveAttribute('aria-selected', 'false');
  });

  it('keeps what was typed into a step when it is left and returned to', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.type(await screen.findByTestId('presmoke-name-input'), 'Brisket');
    await user.click(segment('Post-Smoke'));
    // Leaving the step is what saves it, and the save is a round trip: wait for
    // it to land before coming back, exactly as the wizard's own save-on-leave
    // has always required. Racing the read against it would test the fake's
    // scheduling rather than the shell.
    await savedTo('presmoke');

    await user.type(await screen.findByTestId('postsmoke-rest-time-input'), '0130');
    await user.click(segment('Pre-Smoke'));
    await savedTo('postSmoke/current');

    expect(await screen.findByTestId('presmoke-name-input')).toHaveValue('Brisket');

    await user.click(segment('Post-Smoke'));
    expect(await screen.findByTestId('postsmoke-rest-time-input')).toHaveValue('01:30');
  });
});

describe('advancing through the wizard', () => {
  it('walks the steps in order, offering to finish only on the last of them', async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByTestId('presmoke-name-input');

    expect(nextButton()).toHaveTextContent('Next');
    await user.click(nextButton());

    expect(await screen.findByTestId('smoke-step')).toBeInTheDocument();
    expect(nextButton()).toHaveTextContent('Next');
    await user.click(nextButton());

    expect(await screen.findByTestId('postsmoke-rest-time-input')).toBeInTheDocument();
    expect(nextButton()).toHaveTextContent('Finish');
  });

  it('finishes the smoke and clears the session, then starts the wizard over', async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByTestId('presmoke-name-input');

    await user.click(segment('Post-Smoke'));
    await screen.findByTestId('postsmoke-rest-time-input');
    await user.click(nextButton());

    await waitFor(() =>
      expect(backend.requests).toContainEqual({
        method: 'post',
        path: 'smoke/finish',
        body: undefined,
      })
    );
    await waitFor(() =>
      expect(backend.requests).toContainEqual({
        method: 'put',
        path: 'state/clearSmoke',
        body: undefined,
      })
    );
    expect(await screen.findByTestId('presmoke-name-input')).toBeInTheDocument();
  });
});

describe('the delay the finish flow waits on', () => {
  it('resolves once the scheduled timer fires, and not before', async () => {
    jest.useFakeTimers();
    try {
      const resolved = jest.fn();
      const pending = delay(10).then(resolved);

      await Promise.resolve();
      expect(resolved).not.toHaveBeenCalled();

      // Fake timers keep this deterministic: measured against the wall clock
      // under coverage it occasionally landed just under the threshold.
      jest.advanceTimersByTime(10);
      await pending;
      expect(resolved).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
