import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { SessionConfig } from 'smoke-session/src';
import { SmokeSessionProvider } from 'smoke-session/src/react';
import { FakeCloudSocket, FakeSessionApi, SteppingClock } from 'smoke-session/src/testing';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../../api';
import {
  createFakeBackend,
  FakeBackend,
  NO_CURRENT_TIMELINE,
  StoredApplicationSettings,
} from '../../../api/fakeBackend';
import { DesignSurface } from '../../../theme';
import { VoiceFillPortsProvider, createFakeExtractor, createFakeSpeech } from '../../../voiceFill';
import { SmokeStepView } from './smokeStep';

/** When every Ramble in this suite is spoken. */
const SPOKEN_AT = new Date('2026-08-01T18:00:00.000Z');

const flushPromises = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** Lets every answer the screen is waiting on arrive, and the ones those ask for. */
const settle = async () => {
  await act(async () => {
    await flushPromises();
    await flushPromises();
    await flushPromises();
  });
};

/** An announcement channel that never announces: the log and the catalogue are read over REST. */
const inert = () => ({ subscribe: () => () => undefined });

/**
 * The probe rows as the settings page stores them: probe 1 watched at 195 on a
 * preset, the other two unwatched at the default.
 */
const storedProbes: Partial<StoredApplicationSettings> = {
  probeTarget: {
    enabled: true,
    probes: [
      { slot: 'probe1', enabled: true, target: 195, targetSource: 'preset' },
      { slot: 'probe2', enabled: false, target: 203, targetSource: 'default' },
      { slot: 'probe3', enabled: false, target: 203, targetSource: 'default' },
    ],
  },
};

/** The cook every backend of this suite is running, as the backend stores it. */
const cookRecord = {
  _id: 'smoke-1',
  preSmokeId: 'pre-1',
  tempsId: 'temps-1',
  postSmokeId: 'post-1',
  smokeProfileId: 'prof-1',
  ratingId: 'rate-1',
  date: new Date('2026-08-01T15:00:00.000Z'),
  status: 0,
};

/** A running cook with a plan: dinner at 22:00, a 45-minute rest. */
const backendWithCook = (settings: Partial<StoredApplicationSettings> = {}): FakeBackend =>
  createFakeBackend({
    state: { smokeId: 'smoke-1', smoking: true },
    appSettings: { settings: { ...storedProbes, ...settings } },
    smoke: {
      records: {
        'smoke-1': {
          ...cookRecord,
          serveAt: new Date('2026-08-01T22:00:00.000Z'),
          restMinutes: 45,
        },
      },
    },
    timeline: {
      current: {
        ...NO_CURRENT_TIMELINE,
        startedAt: '2026-08-01T15:00:00.000Z',
        estimate: {
          state: 'ok',
          eta: '2026-08-01T21:00:00.000Z',
          hoursRemaining: 3,
          ratePerHour: 8.2,
          progressPercent: 62,
          startTemp: 45,
          targetTemp: 195,
        },
        servePlan: {
          serveAt: '2026-08-01T22:00:00.000Z',
          restMinutes: 45,
          pullBy: '2026-08-01T21:15:00.000Z',
          slackMinutes: 15,
          verdict: 'ontrack',
          milestones: [{ kind: 'pullBy', at: '2026-08-01T21:15:00.000Z', temp: null }],
        },
      },
    },
  });

interface Rendered {
  backend: FakeBackend;
}

/**
 * The step under a live session, a client over the in-memory backend, and —
 * where a raw object is given — Voice Fill's two models replaced by scripted
 * ones that answer every Ramble with it.
 */
const renderStep = async (
  raw: unknown | undefined,
  backend: FakeBackend = backendWithCook(),
  smoking = true
): Promise<Rendered> => {
  const api = new FakeSessionApi();
  api.seedSmoking(smoking).seedProfile({
    chamberName: 'Chamber',
    probe1Name: 'Flat',
    probe2Name: '',
    probe3Name: '',
    notes: '',
    woodType: 'Oak',
  });
  const config: SessionConfig = {
    role: 'monitor',
    socket: new FakeCloudSocket(),
    api,
    clock: new SteppingClock(),
  };
  const step = (
    <SmokeSessionProvider config={config}>
      <SmokeStepView
        nextButton={<button data-testid="next-button">Next</button>}
        cookEventsSubscription={inert()}
        stampCatalogueSubscription={inert()}
      />
    </SmokeSessionProvider>
  );
  render(
    <ApiClientProvider client={createApiClient(backend)}>
      <SnackbarProvider>
        <DesignSurface>
          {raw === undefined ? (
            step
          ) : (
            <VoiceFillPortsProvider
              speech={createFakeSpeech({ transcript: 'A Ramble.', wordIntervalMs: 1 })}
              extractor={createFakeExtractor({ raw })}
              now={() => SPOKEN_AT}
            >
              {step}
            </VoiceFillPortsProvider>
          )}
        </DesignSurface>
      </SnackbarProvider>
    </ApiClientProvider>
  );
  await settle();
  return { backend };
};

const tap = async (element: HTMLElement) => {
  // The click is not what needs the act: the answers that follow it are, and
  // they arrive after the click has returned.
  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async () => {
    fireEvent.click(element);
  });
  await settle();
};

/** Speaks the scripted Ramble and leaves the review list up. */
const ramble = async () => {
  await tap(screen.getByRole('button', { name: 'Voice fill' }));
  await tap(await screen.findByRole('button', { name: 'Done talking' }));
  await screen.findByRole('button', { name: /^Fill / });
};

/** Speaks the scripted Ramble and fills every row it proposes. */
const rambleAndFill = async () => {
  await ramble();
  await tap(screen.getByRole('button', { name: /^Fill / }));
};

const undo = () => tap(screen.getByRole('button', { name: 'Undo' }));

const valueOf = (testId: string): string => (screen.getByTestId(testId) as HTMLInputElement).value;

/** Every write the screen made to `path`, in the order it made them. */
const writesTo = (backend: FakeBackend, path: string) =>
  backend.requests.filter(request => request.method !== 'get' && request.path === path);

/**
 * A running cook nobody has planned yet — still warming, so the screen seeds no
 * plan of its own — that carries the rest it has stored, if any.
 */
const backendWithUnplannedCook = (restMinutes?: number): FakeBackend =>
  createFakeBackend({
    state: { smokeId: 'smoke-1', smoking: true },
    appSettings: { settings: storedProbes },
    smoke: {
      records: {
        'smoke-1': { ...cookRecord, ...(restMinutes !== undefined && { restMinutes }) },
      },
    },
    timeline: {
      current: {
        ...NO_CURRENT_TIMELINE,
        startedAt: '2026-08-01T17:40:00.000Z',
        estimate: {
          state: 'warming',
          eta: null,
          hoursRemaining: null,
          ratePerHour: null,
          progressPercent: null,
          startTemp: 45,
          targetTemp: 195,
        },
      },
    },
  });

/** The stored target, watch and source of each probe, by slot. */
const storedTargets = async (backend: FakeBackend) => {
  const settings = await createApiClient(backend).notifications.getSettings();
  return Object.fromEntries(
    (settings?.probeTarget.probes ?? []).map(({ slot, target, enabled, targetSource }) => [
      slot,
      { target, enabled, targetSource },
    ])
  );
};

describe('Voice Fill on the smoke screen', () => {
  test('the button shows where models are provided', async () => {
    await renderStep({});
    expect(screen.getByRole('button', { name: 'Voice fill' })).toBeInTheDocument();
  });

  test('is not offered where no models are provided', async () => {
    await renderStep(undefined);
    expect(screen.queryByRole('button', { name: 'Voice fill' })).not.toBeInTheDocument();
  });

  test('fills the names, the wood and Notes, and Undo puts each back', async () => {
    await renderStep({
      chamberName: 'Offset',
      probe2Name: 'Point',
      woodType: 'hickory',
      notes: 'Bark is setting nicely.',
    });

    await rambleAndFill();

    expect(valueOf('smoke-chamber-name-input')).toBe('Offset');
    expect(valueOf('smoke-probe1-name-input')).toBe('Flat');
    expect(valueOf('smoke-probe2-name-input')).toBe('Point');
    expect(valueOf('smoke-wood-type-input')).toBe('Hickory');
    expect(valueOf('smoke-notes-input')).toBe('Bark is setting nicely.');
    expect(screen.getByTestId('voice-fill-toast')).toHaveTextContent('Filled 4 fields by voice');

    await undo();

    expect(valueOf('smoke-chamber-name-input')).toBe('Chamber');
    expect(valueOf('smoke-probe2-name-input')).toBe('');
    expect(valueOf('smoke-wood-type-input')).toBe('Oak');
    expect(valueOf('smoke-notes-input')).toBe('');
  });

  /** The settings saves a screen made, each as the document it stored. */
  const settingsSaves = (backend: FakeBackend) =>
    backend.requests
      .filter(request => request.method !== 'get' && /settings/i.test(request.path))
      .map(request => request.body);

  test('a target row writes what typing that target writes', async () => {
    const { backend: typed } = await renderStep(undefined);
    fireEvent.change(screen.getByTestId('completion-target-input'), { target: { value: '203' } });
    fireEvent.blur(screen.getByTestId('completion-target-input'));
    await settle();
    expect(settingsSaves(typed)).toHaveLength(1);
    cleanup();

    const { backend: spoken } = await renderStep({
      probeTargets: [{ probe: 'the flat', target: 203 }],
    });
    await rambleAndFill();

    expect(settingsSaves(spoken)).toEqual(settingsSaves(typed));
    expect(await storedTargets(spoken)).toMatchObject({
      probe1: { target: 203, enabled: true, targetSource: 'user' },
    });
  });

  test('a spoken target turns the watch on and counts as the cook’s own, in one save', async () => {
    const { backend } = await renderStep({
      probe2Name: 'Point',
      probeTargets: [
        { probe: 'probe one', target: 203 },
        { probe: 'probe two', target: 198 },
      ],
    });

    await rambleAndFill();

    expect(settingsSaves(backend)).toHaveLength(1);
    expect(await storedTargets(backend)).toEqual({
      probe1: { target: 203, enabled: true, targetSource: 'user' },
      probe2: { target: 198, enabled: true, targetSource: 'user' },
      probe3: { target: 203, enabled: false, targetSource: 'default' },
    });
  });

  test('Undo puts back each probe’s previous target, watch and source', async () => {
    const { backend } = await renderStep({
      probeTargets: [
        { probe: 'probe one', target: 203 },
        { probe: 'probe two', target: 198 },
      ],
    });
    await rambleAndFill();

    await undo();

    expect(await storedTargets(backend)).toEqual({
      probe1: { target: 195, enabled: true, targetSource: 'preset' },
      probe2: { target: 203, enabled: false, targetSource: 'default' },
      probe3: { target: 203, enabled: false, targetSource: 'default' },
    });
  });

  test('Undo leaves a target the cook has typed over the fill’s since', async () => {
    const { backend } = await renderStep({
      probeTargets: [
        { probe: 'probe one', target: 203 },
        { probe: 'probe two', target: 198 },
      ],
    });
    await rambleAndFill();
    fireEvent.change(screen.getByTestId('completion-target-input'), { target: { value: '205' } });
    fireEvent.blur(screen.getByTestId('completion-target-input'));
    await settle();

    await undo();

    expect(await storedTargets(backend)).toEqual({
      probe1: { target: 205, enabled: true, targetSource: 'user' },
      probe2: { target: 203, enabled: false, targetSource: 'default' },
      probe3: { target: 203, enabled: false, targetSource: 'default' },
    });
  });

  test('the serve time and rest rows write what the Serve Plan card’s steppers write', async () => {
    const { backend } = await renderStep({ serveInMinutes: 300, restMinutes: 60 });

    await rambleAndFill();

    expect(writesTo(backend, 'smoke/current/serve-plan')).toEqual([
      {
        method: 'put',
        path: 'smoke/current/serve-plan',
        body: { serveAt: new Date('2026-08-01T23:00:00.000Z') },
      },
      { method: 'put', path: 'smoke/current/serve-plan', body: { restMinutes: 60 } },
    ]);
  });

  test('Undo writes the previous serve time and rest back', async () => {
    const { backend } = await renderStep({ serveInMinutes: 300, restMinutes: 60 });
    await rambleAndFill();

    await undo();

    expect(
      writesTo(backend, 'smoke/current/serve-plan')
        .slice(2)
        .map(request => request.body)
    ).toEqual([{ serveAt: new Date('2026-08-01T22:00:00.000Z') }, { restMinutes: 45 }]);
  });

  test('Undo leaves a serve time moved since the fill, and still puts the rest back', async () => {
    const { backend } = await renderStep({ serveInMinutes: 300, restMinutes: 60 });
    await rambleAndFill();
    // Moved from somewhere else — the touchscreen — after the fill landed.
    const moved = new Date('2026-08-01T23:30:00.000Z');
    await createApiClient(backend).smoke.saveServePlan({ serveAt: moved });

    await undo();

    expect(
      writesTo(backend, 'smoke/current/serve-plan')
        .slice(3)
        .map(request => request.body)
    ).toEqual([{ restMinutes: 45 }]);
    expect(backend.store.smoke.records['smoke-1']).toMatchObject({
      serveAt: moved,
      restMinutes: 45,
    });
  });

  test('Undo leaves a rest changed since the fill', async () => {
    const { backend } = await renderStep({ restMinutes: 60 });
    await rambleAndFill();
    await createApiClient(backend).smoke.saveServePlan({ restMinutes: 90 });

    await undo();

    expect(writesTo(backend, 'smoke/current/serve-plan').map(request => request.body)).toEqual([
      { restMinutes: 60 },
      { restMinutes: 90 },
    ]);
  });

  test('a rest whose previous value cannot be read is not written, and is said so', async () => {
    const backend = backendWithUnplannedCook(30);
    backend.injectFault({ method: 'get', path: 'smoke/smoke-1', status: 500 });
    await renderStep({ restMinutes: 60 }, backend);

    await rambleAndFill();

    expect(await screen.findByText('Could not save the serve plan.')).toBeInTheDocument();
    expect(writesTo(backend, 'smoke/current/serve-plan')).toEqual([]);

    await undo();

    // Nothing of the fill's was stored, so there is nothing of it to take back.
    expect(writesTo(backend, 'smoke/current/serve-plan')).toEqual([]);
  });

  test('the Log now row logs one entry per stamp, and Undo removes them', async () => {
    const { backend } = await renderStep({ stamps: [{ stamp: 'wrap' }, { stamp: 'spritz' }] });

    await rambleAndFill();

    expect(writesTo(backend, 'cook-events').map(request => request.body)).toEqual([
      { stampKey: 'wrap' },
      { stampKey: 'spritz' },
    ]);
    expect(screen.getAllByTestId('cook-event-row')).toHaveLength(2);
    expect(screen.getByTestId('voice-fill-toast')).toHaveTextContent('Filled 1 field by voice');

    await undo();

    expect(screen.queryByTestId('cook-event-row')).not.toBeInTheDocument();
    expect(await createApiClient(backend).cookEvents.listCurrent()).toEqual([]);
  });

  test('an unticked row is not written', async () => {
    const { backend } = await renderStep({
      woodType: 'hickory',
      probeTargets: [{ probe: 'probe one', target: 203 }],
    });
    await ramble();

    await tap(screen.getByRole('checkbox', { name: /Probe 1 target/ }));
    await tap(screen.getByRole('button', { name: /^Fill / }));

    expect(valueOf('smoke-wood-type-input')).toBe('Hickory');
    expect(settingsSaves(backend)).toEqual([]);
  });

  test('the review list writes a target, a serve time, a rest and the stamps as the cook reads them', async () => {
    await renderStep({
      probeTargets: [{ probe: 'probe one', target: 203 }],
      serveInMinutes: 300,
      restMinutes: 60,
      stamps: [{ stamp: 'wrap' }, { stamp: 'spritz' }],
    });

    await ramble();

    const sheet = within(screen.getByTestId('voice-fill-sheet'));
    const serveTime = new Date('2026-08-01T23:00:00.000Z').toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    expect(sheet.getByRole('checkbox', { name: /Probe 1 target/ })).toHaveAccessibleName(
      /203°F 195°F/
    );
    expect(sheet.getByRole('checkbox', { name: /Serve time/ })).toHaveAccessibleName(
      new RegExp(serveTime)
    );
    expect(sheet.getByRole('checkbox', { name: /Rest duration/ })).toHaveAccessibleName(/1 h/);
    expect(sheet.getByRole('checkbox', { name: /Log now/ })).toHaveAccessibleName(
      /Wrapped, Spritzed/
    );
  });

  test('a cook that is not running is offered no stamp to log: it goes to Notes', async () => {
    const backend = createFakeBackend({ state: { smokeId: 'smoke-1', smoking: false } });
    await renderStep({ stamps: [{ stamp: 'wrap' }] }, backend, false);

    await ramble();

    expect(screen.queryByTestId('voice-fill-row-stamps')).not.toBeInTheDocument();
    expect(screen.getByTestId('voice-fill-row-notes')).toHaveTextContent('Log now: wrap.');
  });

  test('Undo on a cook that had no plan takes the serve time off and puts its stored rest back', async () => {
    const backend = backendWithUnplannedCook(30);
    await renderStep({ serveInMinutes: 300, restMinutes: 60 }, backend);
    await rambleAndFill();
    expect(writesTo(backend, 'smoke/current/serve-plan').map(request => request.body)).toEqual([
      { serveAt: new Date('2026-08-01T23:00:00.000Z') },
      { restMinutes: 60 },
    ]);

    await undo();

    expect(
      writesTo(backend, 'smoke/current/serve-plan')
        .slice(2)
        .map(request => request.body)
    ).toEqual([{ serveAt: null }, { restMinutes: 30 }]);
  });

  test('Undo on a cook that had no rest stored leaves it with none', async () => {
    const backend = backendWithUnplannedCook();
    await renderStep({ restMinutes: 60 }, backend);
    await rambleAndFill();

    await undo();

    expect(writesTo(backend, 'smoke/current/serve-plan').map(request => request.body)).toEqual([
      { restMinutes: 60 },
      { restMinutes: null },
    ]);
  });

  test('with the planner switched off, a serve time and a rest go to Notes and no plan is written', async () => {
    const backend = backendWithCook({
      servePlan: { enabled: false, driftAlert: true, driftMin: 30 },
    });
    await renderStep({ serveInMinutes: 300, restMinutes: 60 }, backend);

    await rambleAndFill();

    expect(valueOf('smoke-notes-input')).toBe(
      'Serve time: in 300 minutes. Rest duration: 60 minutes.'
    );
    expect(writesTo(backend, 'smoke/current/serve-plan')).toEqual([]);
  });

  test('a target that could not be saved is said so, and Undo writes nothing over it', async () => {
    const backend = backendWithCook();
    backend.injectFault({ method: 'post', path: 'appSettings', status: 500 });
    await renderStep({ probeTargets: [{ probe: 'probe one', target: 203 }] }, backend);

    await rambleAndFill();

    expect(await screen.findByText('Could not save the target temperature.')).toBeInTheDocument();

    await undo();

    // The one save is the fill's own, which failed: there is nothing of it to
    // take back, and the probe is as it was.
    expect(settingsSaves(backend)).toHaveLength(1);
    expect(await storedTargets(backend)).toMatchObject({
      probe1: { target: 195, enabled: true, targetSource: 'preset' },
    });
  });
});
