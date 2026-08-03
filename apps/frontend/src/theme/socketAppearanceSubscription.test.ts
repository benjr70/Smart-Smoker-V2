/**
 * The channel another client's appearance change arrives on.
 *
 * The socket itself is the system boundary and is the one thing faked here;
 * everything asserted is what a listener is handed, so the tests say what the
 * browser learns from the announcement rather than how the frame is plumbed.
 */
import { AppearancePreference } from 'theme/src';
import { createSocketAppearanceSubscription } from './socketAppearanceSubscription';

type Handler = (payload: unknown) => void;

const handlers = new Map<string, Handler[]>();
const mockSocket = {
  on: jest.fn((event: string, handler: Handler) => {
    handlers.set(event, [...(handlers.get(event) ?? []), handler]);
  }),
  off: jest.fn((event: string, handler: Handler) => {
    handlers.set(
      event,
      (handlers.get(event) ?? []).filter(each => each !== handler)
    );
  }),
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

describe('an appearance another client chose', () => {
  it('reaches this browser over the socket the application already speaks', () => {
    process.env.WS_URL = 'ws://localhost:3001';
    const heard: AppearancePreference[] = [];

    createSocketAppearanceSubscription().subscribe(preference => heard.push(preference));
    announce({ mode: 'dark', resolvedMode: 'dark' });

    expect(io).toHaveBeenCalledWith('ws://localhost:3001');
    expect(heard).toEqual([{ mode: 'dark', resolvedMode: 'dark' }]);
  });

  it('stops reaching a browser that has stopped listening, and takes the connection with it', () => {
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
   * The appearance decides what every screen looks like, so a frame that is not
   * a preference is dropped rather than painted: repainting from it would leave
   * the browser showing a scheme the next load contradicts.
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
