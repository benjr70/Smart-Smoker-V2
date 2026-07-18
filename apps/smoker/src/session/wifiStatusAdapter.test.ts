import { createWifiStatusAdapter } from './wifiStatusAdapter';
import { getConnection } from '../services/deviceService';

jest.mock('../services/deviceService', () => ({
  getConnection: jest.fn(),
}));

const mockGetConnection = getConnection as jest.MockedFunction<typeof getConnection>;

describe('createWifiStatusAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports connected when the device returns at least one network', async () => {
    mockGetConnection.mockResolvedValue([{ ssid: 'HomeNetwork' }]);

    const adapter = createWifiStatusAdapter();

    await expect(adapter.getStatus()).resolves.toBe(true);
  });

  it('reports disconnected when the device returns no networks', async () => {
    mockGetConnection.mockResolvedValue([]);

    const adapter = createWifiStatusAdapter();

    await expect(adapter.getStatus()).resolves.toBe(false);
  });
});
