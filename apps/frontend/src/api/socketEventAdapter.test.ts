import { createSocketCookEventsSubscription, createSocketEventPort } from './socketEventAdapter';

const mockSocket = { emit: jest.fn(), on: jest.fn(), off: jest.fn(), close: jest.fn() };

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
  mockSocket.on.mockClear();
  mockSocket.off.mockClear();
  mockSocket.close.mockClear();
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

describe('the cook log announcement channel', () => {
  /** The listener the port registered for the backend's announcements. */
  const handler = (): ((payload: unknown) => void) =>
    mockSocket.on.mock.calls.find(call => call[0] === 'cookEventsUpdate')?.[1];

  test('opens no socket until something subscribes', () => {
    createSocketCookEventsSubscription();

    expect(io).not.toHaveBeenCalled();
  });

  test('hands on the log the backend announced', () => {
    process.env.WS_URL = 'ws://localhost:3002';
    const heard: unknown[] = [];

    createSocketCookEventsSubscription().subscribe(events => heard.push(events));
    handler()([{ _id: 'event-1', stampKey: 'wood', at: '2026-08-25T12:00:00.000Z' }]);

    expect(io).toHaveBeenCalledWith('ws://localhost:3002');
    expect(heard).toHaveLength(1);
  });

  test('drops a frame that is not a log at all', () => {
    const heard: unknown[] = [];

    createSocketCookEventsSubscription().subscribe(events => heard.push(events));
    handler()(undefined);
    handler()({ not: 'a list' });

    // A client that applied a malformed frame would show a log no reload agrees
    // with.
    expect(heard).toEqual([]);
  });

  test('closes the connection when the screen stops listening', () => {
    const stop = createSocketCookEventsSubscription().subscribe(() => undefined);

    stop();

    expect(mockSocket.off).toHaveBeenCalledWith('cookEventsUpdate', expect.any(Function));
    expect(mockSocket.close).toHaveBeenCalled();
  });
});
