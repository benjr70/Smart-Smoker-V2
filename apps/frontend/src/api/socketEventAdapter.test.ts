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
  test('emitClear connects to WS_URL and broadcasts the clear event with true', () => {
    process.env.WS_URL = 'ws://localhost:3002';

    createSocketEventPort().emitClear();

    expect(io).toHaveBeenCalledWith('ws://localhost:3002');
    expect(mockSocket.emit).toHaveBeenCalledWith('clear', true);
  });

  test('emitClear falls back to an empty url when WS_URL is unset', () => {
    delete process.env.WS_URL;

    createSocketEventPort().emitClear();

    expect(io).toHaveBeenCalledWith('');
    expect(mockSocket.emit).toHaveBeenCalledWith('clear', true);
  });

  test('constructing the port opens no socket until emitClear is called', () => {
    process.env.WS_URL = 'ws://localhost:3002';

    createSocketEventPort();

    expect(io).not.toHaveBeenCalled();
  });
});
