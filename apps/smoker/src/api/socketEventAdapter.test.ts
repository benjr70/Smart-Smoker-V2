/**
 * The panel's one outbound socket signal: that the cook the state pointed at is
 * gone. It reaches the same gateway, on the same cloud URL, that the appearance
 * subscription and the session feed use, because that is the only address this
 * appliance knows the backend by.
 */
import {
  createSocketCookEventsSubscription,
  createSocketEventPort,
  createSocketStampCatalogueSubscription,
} from './socketEventAdapter';

const mockSocket = { emit: jest.fn(), on: jest.fn(), off: jest.fn(), close: jest.fn() };

/** The handler the adapter registered for an event, as a test may fire it. */
const handlerFor = (event: string): ((payload?: unknown) => void) =>
  mockSocket.on.mock.calls.find(([name]: [string]) => name === event)?.[1];

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

/**
 * How the panel hears that somebody logged something — on a phone, in a
 * browser, or on this very screen. The kiosk hangs in a garage with nobody near
 * it to reload, so the announcement is the only way it finds out before its
 * next boot.
 */
describe('the cook log subscription', () => {
  test('opens no socket until something subscribes', () => {
    createSocketCookEventsSubscription();

    expect(io).not.toHaveBeenCalled();
  });

  test('hands on an announced log from the cloud URL', () => {
    process.env.REACT_APP_CLOUD_URL = 'http://localhost:3001';
    const heard: unknown[] = [];

    createSocketCookEventsSubscription().subscribe(events => heard.push(events));
    handlerFor('cookEventsUpdate')([{ _id: 'e1' }]);

    expect(io).toHaveBeenCalledWith('http://localhost:3001');
    expect(heard).toEqual([[{ _id: 'e1' }]]);
  });

  /**
   * A frame that is not a log is dropped rather than passed on: a panel that
   * applied one would show a cook log no reload agrees with, and there is
   * nobody in the garage to reload it.
   */
  test('drops a frame that is not a log', () => {
    const heard: unknown[] = [];

    createSocketCookEventsSubscription().subscribe(events => heard.push(events));
    handlerFor('cookEventsUpdate')({ not: 'a log' });

    expect(heard).toEqual([]);
  });

  /**
   * An announcement reaches only whoever was connected when it was made. This
   * appliance is switched on before the tailnet is and drops off it routinely,
   * so the moment the channel is up is the moment it is worth asking what was
   * missed.
   */
  test('says so every time the channel comes up', () => {
    let connections = 0;

    createSocketCookEventsSubscription().subscribe(
      () => undefined,
      () => {
        connections += 1;
      }
    );
    handlerFor('connect')();

    expect(connections).toBe(1);
  });

  test('lets go of the socket when the screen stops listening', () => {
    const stop = createSocketCookEventsSubscription().subscribe(() => undefined);

    stop();

    expect(mockSocket.off).toHaveBeenCalledWith('cookEventsUpdate', expect.any(Function));
    expect(mockSocket.close).toHaveBeenCalled();
  });
});

/** How the panel hears that the catalogue behind its buttons was edited. */
describe('the stamp catalogue subscription', () => {
  test('opens no socket until something subscribes', () => {
    createSocketStampCatalogueSubscription();

    expect(io).not.toHaveBeenCalled();
  });

  test('hands on an announced catalogue as it arrived', () => {
    const heard: unknown[] = [];

    createSocketStampCatalogueSubscription().subscribe(stamps => heard.push(stamps));
    handlerFor('cookLogStamps')([{ key: 'wood', label: 'Wood' }]);

    expect(heard).toEqual([[{ key: 'wood', label: 'Wood' }]]);
  });

  test('says so every time the channel comes up', () => {
    let connections = 0;

    createSocketStampCatalogueSubscription().subscribe(
      () => undefined,
      () => {
        connections += 1;
      }
    );
    handlerFor('connect')();

    expect(connections).toBe(1);
  });

  test('lets go of the socket when the screen stops listening', () => {
    const stop = createSocketStampCatalogueSubscription().subscribe(() => undefined);

    stop();

    expect(mockSocket.off).toHaveBeenCalledWith('cookLogStamps', expect.any(Function));
    expect(mockSocket.close).toHaveBeenCalled();
  });
});
