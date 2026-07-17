import { getNotificationSettings, setNotificationSettings } from './notificationsService';
import { createApiClient } from '../api/client';
import { createFakeBackend, FakeBackend } from '../api/fakeBackend';
import { NotificationSettings } from '../api/types';

// Mock only the client-injection boundary: the deprecated shims delegate to the
// default client, backed here by an in-memory fake backend. Everything below the
// seam (real client + real fake backend) runs.
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, getDefaultApiClient: jest.fn() };
});

// eslint-disable-next-line import/first, @typescript-eslint/no-var-requires
const api = require('../api');

const editableRule: NotificationSettings = {
  type: false,
  message: 'Meat done',
  probe1: 'Chamber',
  op: '>',
  probe2: 'Probe 1',
  offset: 5,
  temperature: 165,
};

let backend: FakeBackend;

beforeEach(() => {
  backend = createFakeBackend({ notifications: { settings: [editableRule] } });
  (api.getDefaultApiClient as jest.Mock).mockReturnValue(createApiClient(backend));
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('notificationsService (deprecated shims)', () => {
  describe('getNotificationSettings', () => {
    test('resolves the unwrapped settings array on success', async () => {
      const result = await getNotificationSettings();
      expect(result).toEqual([editableRule]);
      expect(backend.requests).toContainEqual({
        method: 'get',
        path: 'notifications/settings',
        body: undefined,
      });
    });

    test('resolves undefined and logs on failure', async () => {
      backend.injectFault({ method: 'get', path: 'notifications/settings', status: 500 });
      const consoleSpy = jest.spyOn(console, 'log');

      const result = await getNotificationSettings();

      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('setNotificationSettings', () => {
    test('posts the projected rules in the legacy envelope, stripping _id/__v', async () => {
      await setNotificationSettings({
        settings: [{ ...editableRule, _id: 'rule-1', __v: 0 }],
      });

      const sent = backend.requests.find(r => r.method === 'post');
      expect(sent?.path).toBe('notifications/settings');
      const rule = (sent?.body as { settings: Record<string, unknown>[] }).settings[0];
      expect(rule).not.toHaveProperty('_id');
      expect(rule).not.toHaveProperty('__v');
    });

    test('preserves lastNotificationSent when present', async () => {
      const sent = '2026-07-10T00:00:00.000Z';
      await setNotificationSettings({
        settings: [{ ...editableRule, _id: 'rule-1', lastNotificationSent: sent }],
      });

      const rule = (
        backend.requests.find(r => r.method === 'post')?.body as {
          settings: Record<string, unknown>[];
        }
      ).settings[0];
      expect(rule.lastNotificationSent).toBe(sent);
    });

    test('sends an empty settings array when given no settings', async () => {
      await setNotificationSettings({});
      expect(backend.requests).toContainEqual({
        method: 'post',
        path: 'notifications/settings',
        body: { settings: [] },
      });
    });

    test('handles null settings without throwing', async () => {
      await setNotificationSettings(null);
      expect(backend.requests).toContainEqual({
        method: 'post',
        path: 'notifications/settings',
        body: { settings: [] },
      });
    });

    test('resolves undefined and logs on failure', async () => {
      backend.injectFault({ method: 'post', path: 'notifications/settings', status: 500 });
      const consoleSpy = jest.spyOn(console, 'log');

      const result = await setNotificationSettings({ settings: [editableRule] });

      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });
  });
});
