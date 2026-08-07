/**
 * The channel a browser's appearance change arrives on in the garage.
 *
 * The socket itself is the system boundary and is the one thing faked here;
 * everything asserted is what a listener is handed, so the tests say what the
 * device learns from the announcement rather than how the frame is plumbed.
 */
import { AppearancePreference } from 'theme/src';
import { createSocketAppearanceSubscription } from './socketAppearanceSubscription';

type Handler = (payload: unknown) => void;

const handlers = new Map<string, Handler[]>();
const mockSocket = {
  on: jest.fn(),
  off: jest.fn(),
  close: jest.fn(),
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { io } = require('socket.io-client');

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  handlers.clear();
  // react-scripts sets resetMocks:true, wiping the factory implementations
  // before each test — re-establish them here.
  io.mockReturnValue(mockSocket);
  mockSocket.on.mockImplementation((event: string, handler: Handler) => {
    handlers.set(event, [...(handlers.get(event) ?? []), handler]);
  });
  mockSocket.off.mockImplementation((event: string, handler: Handler) => {
    handlers.set(
      event,
      (handlers.get(event) ?? []).filter(each => each !== handler)
    );
  });
});

afterEach(() => {
  process.env = originalEnv;
});

/** The backend telling every connected client how the installation now looks. */
const announce = (payload: unknown): void =>
  (handlers.get('appearance') ?? []).forEach(handler => handler(payload));

/** The socket reaching the cloud — for the first time, or after a drop. */
const connects = (): void => (handlers.get('connect') ?? []).forEach(handler => handler(undefined));

describe('an appearance a browser chose', () => {
  it('reaches the device over the socket it already speaks to the cloud', () => {
    process.env.REACT_APP_CLOUD_URL = 'ws://cloud:3001';
    const heard: AppearancePreference[] = [];

    createSocketAppearanceSubscription().subscribe(preference => heard.push(preference));
    announce({ mode: 'system', resolvedMode: 'dark' });

    expect(io).toHaveBeenCalledWith('ws://cloud:3001');
    expect(heard).toEqual([{ mode: 'system', resolvedMode: 'dark' }]);
  });

  it('stops reaching a device that has stopped listening, and takes the connection with it', () => {
    const heard: AppearancePreference[] = [];
    const stop = createSocketAppearanceSubscription().subscribe(preference =>
      heard.push(preference)
    );

    stop();
    announce({ mode: 'dark', resolvedMode: 'dark' });

    expect(heard).toEqual([]);
    expect(mockSocket.close).toHaveBeenCalled();
  });

  /**
   * The appearance decides what the whole panel looks like, so a frame that is
   * not a preference is dropped rather than painted: the device has no operator
   * to notice it went the wrong colour and no reload coming to put it back.
   */
  it('is ignored when what arrived could not have been one', () => {
    const heard: AppearancePreference[] = [];
    createSocketAppearanceSubscription().subscribe(preference => heard.push(preference));

    announce('dark');
    announce(null);
    announce({ mode: 'chartreuse', resolvedMode: 'dark' });
    announce({ mode: 'dark' });

    expect(heard).toEqual([]);
  });
});

/**
 * An announcement only reaches the clients connected when it was made, and this
 * appliance is switched on before the tailnet is and drops off it routinely. So
 * the connection itself is news: it is the moment the device can find out what
 * was decided while it was away, and the only one it gets before its next boot.
 */
describe('the socket reaching the cloud', () => {
  it('is reported, so the device can ask what it missed', () => {
    let connections = 0;

    createSocketAppearanceSubscription().subscribe(
      () => undefined,
      () => (connections += 1)
    );
    connects();
    connects();

    expect(connections).toBe(2);
  });

  it('is not reported to a device that has stopped listening', () => {
    let connections = 0;
    const stop = createSocketAppearanceSubscription().subscribe(
      () => undefined,
      () => (connections += 1)
    );

    stop();
    connects();

    expect(connections).toBe(0);
  });

  /** A caller with no use for it says so by not passing one. */
  it('costs nothing to a device that did not ask to be told', () => {
    expect(() => {
      createSocketAppearanceSubscription().subscribe(() => undefined);
      connects();
    }).not.toThrow();
  });
});
