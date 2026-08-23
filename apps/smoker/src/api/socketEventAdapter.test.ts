/**
 * The panel's one outbound socket signal: that the cook the state pointed at is
 * gone. It reaches the same gateway, on the same cloud URL, that the appearance
 * subscription and the session feed use, because that is the only address this
 * appliance knows the backend by.
 */
import { createSocketEventPort } from './socketEventAdapter';

const mockSocket = { emit: jest.fn() };

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { io } = require('socket.io-client');

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  // react-scripts sets resetMocks:true, wiping the factory implementation
  // before each test — re-establish it here.
  io.mockReturnValue(mockSocket);
  mockSocket.emit.mockClear();
});

afterEach(() => {
  process.env = originalEnv;
});

describe('socketEventAdapter', () => {
  test('emitClear connects to the cloud URL and broadcasts the clear event with true', () => {
    process.env.REACT_APP_CLOUD_URL = 'http://localhost:3001';

    createSocketEventPort().emitClear();

    expect(io).toHaveBeenCalledWith('http://localhost:3001');
    expect(mockSocket.emit).toHaveBeenCalledWith('clear', true);
  });

  test('emitClear falls back to an empty url when no cloud URL was baked in', () => {
    delete process.env.REACT_APP_CLOUD_URL;

    createSocketEventPort().emitClear();

    expect(io).toHaveBeenCalledWith('');
    expect(mockSocket.emit).toHaveBeenCalledWith('clear', true);
  });

  /**
   * An appliance that never recovers a session never opens this connection: the
   * panel already holds two, and a third that says nothing is a third that can
   * still drop, reconnect and be counted.
   */
  test('constructing the port opens no socket until emitClear is called', () => {
    process.env.REACT_APP_CLOUD_URL = 'http://localhost:3001';

    createSocketEventPort();

    expect(io).not.toHaveBeenCalled();
  });
});
