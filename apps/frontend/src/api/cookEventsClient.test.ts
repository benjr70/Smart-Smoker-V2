import { ApiError } from 'api-transport/src';
import { createApiClient } from './client';
import { createFakeBackend } from './fakeBackend';
import { DEFAULT_STAMPS } from './cookStamps';

describe('cook events client — endpoint contract', () => {
  test('methods hit the exact backend paths', async () => {
    const backend = createFakeBackend({ state: { smokeId: 'smoke-1', smoking: true } });
    const client = createApiClient(backend);

    await client.cookEvents.listCurrent();
    const recorded = await client.cookEvents.record('wood');
    await client.cookEvents.listForSmoke('smoke-1');
    await client.cookEvents.deleteById(recorded._id);

    expect(backend.requests.map(r => ({ method: r.method, path: r.path, body: r.body }))).toEqual([
      { method: 'get', path: 'cook-events/current', body: undefined },
      { method: 'post', path: 'cook-events', body: { stampKey: 'wood' } },
      { method: 'get', path: 'cook-events/smoke/smoke-1', body: undefined },
      { method: 'delete', path: `cook-events/${recorded._id}`, body: undefined },
    ]);
  });

  test('reads the logged moment back as a date, whatever JSON made of it', async () => {
    const backend = createFakeBackend({
      cookEvents: {
        current: [
          {
            _id: 'event-1',
            smokeId: 'smoke-1',
            stampKey: 'wrap',
            label: 'Wrapped',
            tone: 'p1',
            at: '2026-08-25T12:34:00.000Z',
            chamberTemp: 243,
            probe1Temp: 162,
            probe2Temp: null,
            probe3Temp: null,
          },
        ],
      },
    });
    const client = createApiClient(backend);

    const [event] = await client.cookEvents.listCurrent();

    expect(event.at).toEqual(new Date('2026-08-25T12:34:00.000Z'));
    expect(event.chamberTemp).toBe(243);
    expect(event.probe2Temp).toBeNull();
  });

  test('lists the log oldest first, whatever order the wire carried', async () => {
    const backend = createFakeBackend({
      cookEvents: {
        current: [
          {
            _id: 'b',
            smokeId: 's',
            stampKey: 'wrap',
            label: 'Wrapped',
            tone: 'p1',
            at: '2026-08-25T13:00:00.000Z',
          },
          {
            _id: 'a',
            smokeId: 's',
            stampKey: 'wood',
            label: 'Added Wood',
            tone: 'amber',
            at: '2026-08-25T12:00:00.000Z',
          },
        ],
      },
    });
    const client = createApiClient(backend);

    expect((await client.cookEvents.listCurrent()).map(event => event._id)).toEqual(['a', 'b']);
  });

  test('a tap with no cook in progress rejects with the typed conflict', async () => {
    const backend = createFakeBackend({ state: { smokeId: '', smoking: false } });
    const client = createApiClient(backend);

    const error = (await client.cookEvents.record('wood').catch(e => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
  });
});

describe('the stamps the buttons are drawn from', () => {
  test('are the six the backend records under those keys', () => {
    expect(DEFAULT_STAMPS.map(stamp => stamp.key)).toEqual([
      'wood',
      'wrap',
      'spritz',
      'vent',
      'lid',
      'sauce',
    ]);
    expect(DEFAULT_STAMPS.map(stamp => stamp.label)).toEqual([
      'Added Wood',
      'Wrapped',
      'Spritzed',
      'Vent',
      'Lid Open',
      'Sauced',
    ]);
  });
});
