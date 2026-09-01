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
import fs from 'fs';
import path from 'path';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../api';
import { createFakeBackend, FakeBackend } from '../../api/fakeBackend';
import { DesignSurface, appTheme } from '../../theme';
import { WeightUnits } from '../common/interfaces/enums';
import { Smoke, delay } from './smoke';

jest.mock('./smokeStep/smokeStep', () => ({
  SmokeStep: ({
    nextButton,
    onOpenSettings,
  }: {
    nextButton: JSX.Element;
    onOpenSettings?: () => void;
  }) => (
    <div data-testid="smoke-step">
      <button data-testid="smoke-step-open-settings" onClick={onOpenSettings}>
        Settings
      </button>
      {nextButton}
    </div>
  ),
}));

let backend: FakeBackend;

const renderWizard = (onViewHistory?: () => void, onOpenSettings?: () => void) => {
  // A session already under way: both steps have a stored document, which is
  // what the save-on-leave needs — a step whose load failed deliberately writes
  // nothing back (see `useCurrentResource`), so a wizard over an empty backend
  // would be testing that safety rule rather than this shell.
  backend = createFakeBackend({
    state: { smokeId: 'test-id', smoking: true },
    smoke: {
      // The cook the session names, so what the wizard writes against the cook
      // in progress — the pull it stamps on the way to Post-Smoke — has a cook
      // to be written onto.
      records: { 'test-id': { _id: 'test-id' } as never },
      finish: { _id: 'test-id' } as never,
    },
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
            <Smoke onViewHistory={onViewHistory} onOpenSettings={onOpenSettings} />
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

  /**
   * Saying `position: sticky` is only half of sticking. A sticky box is pinned
   * inside its nearest scrolling ancestor, and any ancestor that declares a
   * scrolling `overflow` becomes that ancestor — including one that never
   * scrolls itself, because it is as tall as its content while the document is
   * what the reader scrolls. The shell every screen is wrapped in used to
   * declare `overflow: auto`, and the header measured its stickiness against a
   * box that never moved: scrolled 800px down, the header was 800px above the
   * top of the screen.
   *
   * jsdom computes no layout, so the assertion above cannot see this and the
   * stylesheet is read from disk instead — the same reason
   * `barClearance.test.tsx` reads them that way (the test runner replaces
   * stylesheet imports with a proxy).
   */
  it('is not pinned to a shell that never scrolls', () => {
    const shellStyles = fs
      .readFileSync(path.resolve(__dirname, '..', '..', 'App.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const shell = /\.App-header\s*\{([^}]*)\}/.exec(shellStyles);

    expect(shell).not.toBeNull();
    expect(shell?.[1]).not.toMatch(/overflow(-y)?:\s*(auto|scroll|hidden|overlay)/);
  });

  /**
   * The segments say they are tabs, so the step below them has to be the panel
   * they switch: otherwise a screen reader announces three tabs and there is
   * nothing they lead to.
   */
  it('makes the step below it the panel its segments switch, named by the step in effect', async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByTestId('presmoke-name-input');

    const panel = screen.getByRole('tabpanel');
    expect(panel).toContainElement(screen.getByTestId('presmoke-name-input'));
    expect(segment('Pre-Smoke')).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAccessibleName('Pre-Smoke');

    await user.click(segment('Post-Smoke'));

    await waitFor(() => expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Post-Smoke'));
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
  it('hands the smoke step the way to the settings screen', async () => {
    // The completion card's no-probe prompt links to settings, and the wizard
    // is the only thing between that card and the shell that navigates.
    const user = userEvent.setup();
    const onOpenSettings = jest.fn();
    renderWizard(undefined, onOpenSettings);
    await screen.findByTestId('presmoke-name-input');

    await user.click(segment('Smoke'));
    await user.click(await screen.findByTestId('smoke-step-open-settings'));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

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

  /**
   * A stamp is something done to a cook that is running. The pre-smoke step is
   * for a cook that has not started and the post-smoke step for one that is
   * over, so neither offers the log — the card belongs to the smoke step alone,
   * which is the only place it is rendered.
   */
  it('offers the cook log on no step but the smoke step', async () => {
    const user = userEvent.setup();
    renderWizard();

    await screen.findByTestId('presmoke-name-input');
    expect(screen.queryByTestId('cook-log-card')).not.toBeInTheDocument();

    await user.click(segment('Post-Smoke'));
    await screen.findByTestId('postsmoke-rest-time-input');
    expect(screen.queryByTestId('cook-log-card')).not.toBeInTheDocument();
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

  /**
   * The meat comes off when the pitmaster leaves the Smoke step, so that is
   * where the pull is stamped: no second gesture, and no field to fill in
   * before the rest can be counted.
   */
  it('stamps the pull when the cook is advanced from Smoke to Post-Smoke', async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByTestId('presmoke-name-input');

    await user.click(nextButton());
    await screen.findByTestId('smoke-step');
    await user.click(nextButton());

    await screen.findByTestId('postsmoke-rest-time-input');
    await waitFor(() =>
      expect(
        backend.requests.filter(request => request.path === 'smoke/current/pull')
      ).toHaveLength(1)
    );
  });

  /**
   * The pull is a moment that happened, not a state the screen is in: walking
   * back to the Smoke step and forward again must leave the rest counting from
   * when the meat actually came off.
   */
  it('leaves the pull where it was stamped when the step is left and returned to', async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByTestId('presmoke-name-input');

    await user.click(segment('Smoke'));
    await screen.findByTestId('smoke-step');
    await user.click(nextButton());
    await screen.findByTestId('postsmoke-rest-time-input');
    const stamped = backend.store.smoke.records['test-id'].pullAt;

    await user.click(segment('Smoke'));
    await screen.findByTestId('smoke-step');
    await user.click(nextButton());
    await screen.findByTestId('postsmoke-rest-time-input');

    expect(backend.store.smoke.records['test-id'].pullAt).toEqual(stamped);
  });

  /**
   * Steps are switchable in any order — the header's control is not a wizard
   * gate — but only leaving the Smoke step means the meat came off. Opening
   * Post-Smoke straight from Pre-Smoke stamps nothing.
   */
  it('stamps no pull for a step the cook never smoked through', async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByTestId('presmoke-name-input');

    await user.click(segment('Post-Smoke'));
    await screen.findByTestId('postsmoke-rest-time-input');

    expect(backend.requests.some(request => request.path === 'smoke/current/pull')).toBe(false);
  });

  it('ends every step with its primary action against the right-hand edge', async () => {
    // The design ends each step with one auto-width button pinned right, which
    // is what the reversed row under the form does.
    const user = userEvent.setup();
    renderWizard();
    await screen.findByTestId('presmoke-name-input');

    const foot = () => nextButton().parentElement as HTMLElement;
    expect(getComputedStyle(foot()).flexDirection).toBe('row-reverse');
    // Not stretched across the form: the button is as wide as it needs to be.
    expect(nextButton()).not.toHaveStyle({ width: '100%' });

    await user.click(segment('Post-Smoke'));
    await screen.findByTestId('postsmoke-rest-time-input');

    expect(getComputedStyle(foot()).flexDirection).toBe('row-reverse');
  });

  it('finishes the smoke and clears the session, and says so', async () => {
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

    // Ending a cook used to drop the user back on an empty pre-smoke form, with
    // nothing to say whether the session had been saved or thrown away. The
    // design ends it on a moment of its own.
    const complete = await screen.findByTestId('smoke-complete');
    expect(complete).toHaveTextContent('Smoke Complete!');
    expect(complete).toHaveTextContent('Your session has been saved to history.');
    // The step it took the place of is gone: there is no session left to edit.
    expect(screen.queryByTestId('postsmoke-rest-time-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('presmoke-name-input')).not.toBeInTheDocument();
  });

  it('keeps the header and step control over the completion screen, and starts the next cook from them', async () => {
    // The completion screen takes the place of the step, not of the wizard. It
    // has to: the Smoke tab is already the screen in effect, so tapping it again
    // mounts nothing new — a completion screen that replaced the whole wizard
    // would be a dead end, escapable only by a detour through another screen.
    const user = userEvent.setup();
    renderWizard();
    await screen.findByTestId('presmoke-name-input');

    await user.click(segment('Post-Smoke'));
    await screen.findByTestId('postsmoke-rest-time-input');
    await user.click(nextButton());
    await screen.findByTestId('smoke-complete');

    expect(screen.getByTestId('smoke-header')).toBeInTheDocument();
    expect(within(screen.getByTestId('smoke-header')).getByRole('tablist')).toBeInTheDocument();

    await user.click(segment('Pre-Smoke'));

    expect(await screen.findByTestId('presmoke-name-input')).toBeInTheDocument();
    expect(screen.queryByTestId('smoke-complete')).not.toBeInTheDocument();
  });

  it('sends the user to the history from the completion screen', async () => {
    const user = userEvent.setup();
    const viewHistory = jest.fn();
    renderWizard(viewHistory);
    await screen.findByTestId('presmoke-name-input');

    await user.click(segment('Post-Smoke'));
    await screen.findByTestId('postsmoke-rest-time-input');
    await user.click(nextButton());

    await user.click(await screen.findByRole('button', { name: 'View History' }));

    expect(viewHistory).toHaveBeenCalledTimes(1);
  });

  it('says the archive failed rather than that the session was saved, and offers the finish again', async () => {
    // A false confirmation is the worst outcome here: the cook is not in the
    // history, the session is still open on the backend, and the one screen
    // that could say so instead says the opposite.
    const user = userEvent.setup();
    renderWizard();
    await screen.findByTestId('presmoke-name-input');
    backend.injectFault({ method: 'post', path: 'smoke/finish', status: 500 });

    await user.click(segment('Post-Smoke'));
    await screen.findByTestId('postsmoke-rest-time-input');
    await user.click(nextButton());

    expect(
      await screen.findByText('Could not finish the smoke — it has not been saved to history.', {
        exact: false,
      })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('smoke-complete')).not.toBeInTheDocument();
    // The session is left alone: clearing it is what makes a cook unreachable,
    // and this one was never archived.
    expect(backend.requests.some(request => request.path === 'state/clearSmoke')).toBe(false);
    // And the user is back where the finish is offered, free to try again.
    expect(await screen.findByTestId('postsmoke-rest-time-input')).toBeInTheDocument();
    expect(nextButton()).toHaveTextContent('Finish');
  });

  it('says so when the smoke was archived but the session could not be closed', async () => {
    // Half a finish is its own thing to say: the cook *is* in the history, so
    // "nothing was saved" would be as wrong as "all done".
    const user = userEvent.setup();
    renderWizard();
    await screen.findByTestId('presmoke-name-input');
    backend.injectFault({ method: 'put', path: 'state/clearSmoke', status: 500 });

    await user.click(segment('Post-Smoke'));
    await screen.findByTestId('postsmoke-rest-time-input');
    await user.click(nextButton());

    expect(
      await screen.findByText(
        'The smoke was saved to history, but the session could not be closed.',
        {
          exact: false,
        }
      )
    ).toBeInTheDocument();
    expect(screen.queryByTestId('smoke-complete')).not.toBeInTheDocument();
    expect(await screen.findByTestId('postsmoke-rest-time-input')).toBeInTheDocument();
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
