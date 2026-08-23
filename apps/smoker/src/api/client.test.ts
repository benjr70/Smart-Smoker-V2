import { DEFAULT_APPEARANCE_PREFERENCE as SHARED_DEFAULT_APPEARANCE_PREFERENCE } from 'theme/src';
import { DEFAULT_APPEARANCE_PREFERENCE, createApiClient } from './client';
import { createFakeBackend } from './fakeBackend';
import { ApiError } from 'api-transport/src';

const buildClient = (
  cloudSeed?: Parameters<typeof createFakeBackend>[0],
  deviceSeed?: Parameters<typeof createFakeBackend>[0]
) => {
  const cloud = createFakeBackend(cloudSeed);
  const device = createFakeBackend(deviceSeed);
  return { cloud, device, client: createApiClient(cloud, device) };
};

describe('smoker api client', () => {
  describe('state resource (cloud base URL)', () => {
    it('getState hits GET `state` on the cloud transport, not the device transport', async () => {
      const { cloud, device, client } = buildClient({
        state: { smokeId: 'smoke-1', smoking: true },
      });

      const result = await client.state.getState();

      expect(result).toEqual({ smokeId: 'smoke-1', smoking: true });
      expect(cloud.requests).toEqual([{ method: 'get', path: 'state', body: undefined }]);
      expect(device.requests).toEqual([]);
    });

    it('toggleSmoking flips the flag via PUT `state/toggleSmoking` on the cloud transport', async () => {
      const { cloud, device, client } = buildClient({
        state: { smokeId: 'smoke-1', smoking: false },
      });

      const result = await client.state.toggleSmoking();

      expect(result).toEqual({ smokeId: 'smoke-1', smoking: true });
      expect(cloud.requests).toEqual([
        { method: 'put', path: 'state/toggleSmoking', body: undefined },
      ]);
      expect(device.requests).toEqual([]);
    });

    // Both state routes answer with an EMPTY body in ordinary operation:
    // `GET state` on a fresh or reset database (StateService.GetState resolves
    // `undefined`), and `PUT state/toggleSmoking` with no current smoke
    // (StateService.toggleSmoking returns an explicit `null`). Every smoker call
    // site reads the result unguarded — `home.tsx` does `state.smoking` inside a
    // `.then()` with no `.catch()` — so the contract is that `.smoking` reads as
    // `undefined` and nothing throws.
    it('getState survives an empty body when no state document exists', async () => {
      const { client } = buildClient({ state: null });

      const result = await client.state.getState();

      expect(result.smoking).toBeUndefined();
    });

    it('toggleSmoking survives an empty body when there is no current smoke', async () => {
      const { client } = buildClient({ state: null });

      const result = await client.state.toggleSmoking();

      expect(result.smoking).toBeUndefined();
    });
  });

  describe('smokeProfile resource (cloud base URL)', () => {
    it('getCurrent normalizes missing notes/woodType to empty strings', async () => {
      const { client } = buildClient({
        smokeProfile: {
          current: {
            chamberName: 'Main',
            probe1Name: 'p1',
            probe2Name: 'p2',
            probe3Name: 'p3',
          },
        },
      });

      const result = await client.smokeProfile.getCurrent();

      expect(result).toEqual({
        chamberName: 'Main',
        probe1Name: 'p1',
        probe2Name: 'p2',
        probe3Name: 'p3',
        notes: '',
        woodType: '',
      });
    });

    it('getCurrent resolves null (not undefined) when no profile has been saved', async () => {
      const { client } = buildClient();

      const result = await client.smokeProfile.getCurrent();

      expect(result).toBeNull();
    });

    it('saveCurrent posts to `smokeProfile/current` on the cloud transport', async () => {
      const { cloud, client } = buildClient();
      const profile = {
        chamberName: 'Main',
        probe1Name: 'p1',
        probe2Name: 'p2',
        probe3Name: 'p3',
        notes: 'n',
        woodType: 'Oak',
      };

      await client.smokeProfile.saveCurrent(profile);

      expect(cloud.requests).toEqual([
        { method: 'post', path: 'smokeProfile/current', body: profile },
      ]);
      expect(cloud.store.smokeProfile.current).toEqual(profile);
    });
  });

  describe('temps resource (cloud base URL)', () => {
    it('getCurrent hits GET `temps` on the cloud transport', async () => {
      const temps = [
        { ChamberTemp: 225, MeatTemp: 185, Meat2Temp: 190, Meat3Temp: 0, date: new Date() },
      ];
      const { cloud, device, client } = buildClient({ temps: { current: temps } });

      const result = await client.temps.getCurrent();

      expect(result).toEqual(temps);
      expect(cloud.requests).toEqual([{ method: 'get', path: 'temps', body: undefined }]);
      expect(device.requests).toEqual([]);
    });

    it('postBatch posts the batch to `temps/batch` on the cloud transport', async () => {
      const batch = [
        { ChamberTemp: 225, MeatTemp: 185, Meat2Temp: 190, Meat3Temp: 0, date: new Date() },
      ];
      const { cloud, client } = buildClient();

      await client.temps.postBatch(batch);

      expect(cloud.requests).toEqual([{ method: 'post', path: 'temps/batch', body: batch }]);
      expect(cloud.store.temps.batches).toEqual([batch]);
    });
  });

  describe('device resource (device-service base URL)', () => {
    it('connectToWiFi posts creds to the device transport, not the cloud transport', async () => {
      const creds = { ssid: 'net', password: 'pw' };
      const { cloud, device, client } = buildClient(undefined, {
        wifi: { connectResult: { success: true, message: 'Connected' } },
      });

      const result = await client.device.connectToWiFi(creds);

      expect(result).toEqual({ success: true, message: 'Connected' });
      expect(device.requests).toEqual([
        { method: 'post', path: 'api/wifiManager/connect', body: creds },
      ]);
      expect(cloud.requests).toEqual([]);
    });

    it('getConnection reads from the device transport, not the cloud transport', async () => {
      const connection = [{ ssid: 'net', status: 'connected' }];
      const { cloud, device, client } = buildClient(undefined, { wifi: { connection } });

      const result = await client.device.getConnection();

      expect(result).toEqual(connection);
      expect(device.requests).toEqual([
        { method: 'get', path: 'api/wifiManager/connection', body: undefined },
      ]);
      expect(cloud.requests).toEqual([]);
    });
  });

  /**
   * The appearance the installation chose. Read-only on purpose: the device has
   * no colour preference of its own to contribute, so it is given no way to say
   * one — the resource has a read and nothing else.
   */
  describe('appearance resource (cloud base URL)', () => {
    it('reads the installation preference from GET `appSettings`', async () => {
      const { cloud, device, client } = buildClient({
        appSettings: { appearance: { mode: 'system', resolvedMode: 'dark' } },
      });

      const result = await client.appearance.get();

      expect(result).toEqual({ mode: 'system', resolvedMode: 'dark' });
      expect(cloud.requests).toEqual([{ method: 'get', path: 'appSettings', body: undefined }]);
      expect(device.requests).toEqual([]);
    });

    /**
     * The route answers with a document whether or not an appearance has ever
     * been chosen, and a deployment older than the block answers without one.
     * Both mean "nothing chosen here", which is the documented default rather
     * than an absence the touchscreen would have to have an opinion about.
     */
    it('reads an installation nobody has chosen an appearance on as the default', async () => {
      const { client } = buildClient({ appSettings: {} });

      await expect(client.appearance.get()).resolves.toEqual({
        mode: 'system',
        resolvedMode: 'dark',
      });
    });

    /**
     * The API layer keeps its own copy of that default so the wire types stay
     * free of domain imports. Two copies can drift, and a drift here would have
     * the touchscreen and the browsers disagreeing about what an installation
     * nobody has chosen for looks like — so they are pinned together.
     */
    it('defaults to exactly what the shared appearance rule defaults to', () => {
      expect(DEFAULT_APPEARANCE_PREFERENCE).toEqual(SHARED_DEFAULT_APPEARANCE_PREFERENCE);
    });

    it('offers no way to write one', () => {
      const { client } = buildClient();

      expect(Object.keys(client.appearance)).toEqual(['get']);
    });
  });

  /**
   * The targets the meat is being cooked to, which the chart rules its dashed
   * lines at. Read-only for the same reason the appearance is: they are
   * configured on a phone, and the panel only draws them.
   */
  describe('probe targets resource (cloud base URL)', () => {
    it('reads the configured probe rows from GET `appSettings`', async () => {
      const { cloud, device, client } = buildClient({
        appSettings: {
          probeTarget: {
            enabled: true,
            probes: [
              { slot: 'probe1', enabled: true, target: 203, targetSource: 'user', name: 'Brisket' },
              { slot: 'probe2', enabled: false, target: 195, targetSource: 'default' },
            ],
          },
        },
      });

      // Which probe, whether it is watched, and what it is being cooked to —
      // and nothing else: where the number came from is the settings page's
      // business, not the panel's.
      await expect(client.probeTargets.get()).resolves.toEqual([
        { slot: 'probe1', enabled: true, target: 203 },
        { slot: 'probe2', enabled: false, target: 195 },
      ]);
      expect(cloud.requests).toEqual([{ method: 'get', path: 'appSettings', body: undefined }]);
      expect(device.requests).toEqual([]);
    });

    /**
     * An installation nobody has configured targets on — and a deployment older
     * than the block — answers without any rows. Both mean "nothing to draw",
     * which is a list of no rows rather than an absence the screen would have to
     * have an opinion about.
     */
    it('reads an installation with no configured targets as no rows at all', async () => {
      const { client } = buildClient({ appSettings: {} });

      await expect(client.probeTargets.get()).resolves.toEqual([]);
    });

    it('offers no way to write one', () => {
      const { client } = buildClient();

      expect(Object.keys(client.probeTargets)).toEqual(['get']);
    });
  });

  describe('timeline resource (cloud base URL)', () => {
    /**
     * The running cook is read from the route that owns it, in one request,
     * rather than from the state followed by a by-id read of whatever it
     * pointed at: the estimate beside the stamp is derived from three
     * collections the panel cannot compose, and the same route is what the web
     * client reads, so both screens are looking at one answer.
     */
    it('getCurrent reads the running cook from `timeline/current`, in one request', async () => {
      const { cloud, device, client } = buildClient({
        state: { smokeId: 'smoke-1', smoking: true },
        timeline: {
          current: {
            startedAt: '2026-08-15T10:00:00.000Z',
            finishedAt: null,
            estimate: { state: 'ok', eta: '2026-08-15T16:30:00.000Z', hoursRemaining: 6.5 },
          },
        },
      });

      const current = await client.timeline.getCurrent();

      expect(current?.startedAt?.toISOString()).toBe('2026-08-15T10:00:00.000Z');
      expect(current?.estimate.state).toBe('ok');
      expect(current?.estimate.eta?.toISOString()).toBe('2026-08-15T16:30:00.000Z');
      // How long is left comes off the same read as the moment it names: a
      // clock time on its own says nothing about which day it is on, and six
      // and a half hours is what tells an overnight cook from an imminent one.
      expect(current?.estimate.hoursRemaining).toBe(6.5);
      expect(cloud.requests).toEqual([
        { method: 'get', path: 'timeline/current', body: undefined },
      ]);
      expect(device.requests).toEqual([]);
    });

    /**
     * A cook the backend stopped by itself carries a finish stamp while it is
     * still the current session — that stamp is the one thing that tells a
     * session waiting to be finished from one waiting to be cooked, so the
     * panel is given it.
     */
    it('getCurrent revives the finish stamp of a cook that was auto-stopped', async () => {
      const { client } = buildClient({
        timeline: {
          current: {
            startedAt: '2026-08-20T12:00:00.000Z',
            finishedAt: '2026-08-20T21:30:00.000Z',
          },
        },
      });

      const current = await client.timeline.getCurrent();

      expect(current?.finishedAt).toEqual(new Date('2026-08-20T21:30:00.000Z'));
    });

    it('reads a cook still running as one with no finish stamp', async () => {
      const { client } = buildClient({
        timeline: { current: { startedAt: '2026-08-20T12:00:00.000Z', finishedAt: null } },
      });

      await expect(client.timeline.getCurrent()).resolves.toMatchObject({ finishedAt: null });
    });

    /**
     * A deployment older than the estimator has no estimate block to send. The
     * panel is handed an estimate of nothing rather than an absence every caller
     * would have to guard, and shows no ETA — which is what it shows for a cook
     * that has none.
     */
    it('reads a body with no estimate block as an estimate of nothing', async () => {
      const { client } = buildClient({
        timeline: { current: { startedAt: '2026-08-15T10:00:00.000Z', finishedAt: null } },
      });

      const current = await client.timeline.getCurrent();

      expect(current?.estimate).toEqual({ state: null, eta: null, hoursRemaining: null });
    });

    /**
     * A deployment older than the route rejects the read — as an unknown id, or
     * as nothing found — and that is the same nothing a panel with no session
     * gets, rather than a failure the one screen with no reload button has to
     * render.
     */
    it.each([400, 404])('resolves null when the backend cannot say (%i)', async status => {
      const { cloud, client } = buildClient({
        timeline: { current: { startedAt: null, finishedAt: null } },
      });
      cloud.injectFault({ method: 'get', path: 'timeline/current', status });

      await expect(client.timeline.getCurrent()).resolves.toBeNull();
    });

    it('lets an outage through rather than passing it off as no cook', async () => {
      const { cloud, client } = buildClient();
      cloud.injectFault({ method: 'get', path: 'timeline/current', status: 503 });

      const error = (await client.timeline.getCurrent().catch(e => e)) as ApiError;

      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(503);
    });

    it('getById reads a named cook’s stamp, revived to a date', async () => {
      const { client } = buildClient({
        timeline: { s1: { startedAt: '2026-08-15T10:00:00.000Z', finishedAt: null } },
      });

      await expect(client.timeline.getById('s1')).resolves.toEqual({
        startedAt: new Date('2026-08-15T10:00:00.000Z'),
      });
    });
  });

  /**
   * What the panel needs to recover from a cook nobody finished: the very calls
   * the wizard on the phone makes, in one place, so the touchscreen composes the
   * same recovery rather than inventing one of its own.
   */
  describe('session resource (cloud base URL)', () => {
    it('finish archives the cook the state points at via POST `smoke/finish`', async () => {
      const { cloud, device, client } = buildClient({
        state: { smokeId: 'smoke-1', smoking: false },
      });

      await client.session.finish();

      // Nothing is sent: what the cook finished at is the stamp the backend
      // already holds, and this call must not offer one of its own.
      expect(cloud.requests).toEqual([{ method: 'post', path: 'smoke/finish', body: undefined }]);
      expect(device.requests).toEqual([]);
    });

    it('clear leaves the state pointing at no cook via PUT `state/clearSmoke`', async () => {
      const { cloud, client } = buildClient({ state: { smokeId: 'smoke-1', smoking: true } });

      await client.session.clear();

      expect(cloud.requests).toEqual([
        { method: 'put', path: 'state/clearSmoke', body: undefined },
      ]);
      expect(cloud.store.state).toEqual({ smokeId: '', smoking: false });
    });

    /**
     * Saving a pre-smoke with no cook current is what creates the next one on
     * the backend — there is no other route that does — so the blank document
     * the wizard's first step starts on is what the panel sends.
     */
    it('startNew creates the next session by saving a blank pre-smoke', async () => {
      const { cloud, client } = buildClient({ state: { smokeId: '', smoking: false } });

      await client.session.startNew();

      expect(cloud.requests).toEqual([
        {
          method: 'post',
          path: 'presmoke',
          body: { name: '', meatType: '', weight: { unit: 'LB' }, steps: [''], notes: '' },
        },
      ]);
      expect(cloud.store.state?.smokeId).toBeTruthy();
    });
  });

  describe('failure mapping', () => {
    it('surfaces an HTTP failure as the typed ApiError with method/path/status', async () => {
      const { cloud, client } = buildClient();
      cloud.injectFault({ method: 'get', path: 'temps', status: 503 });

      const error = (await client.temps.getCurrent().catch(e => e)) as ApiError;

      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(503);
      expect(error.path).toBe('temps');
      expect(error.method).toBe('get');
    });
  });
});
