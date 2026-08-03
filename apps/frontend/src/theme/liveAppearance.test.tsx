/**
 * The installation changing colour while the app is open.
 *
 * The assertion is what an operator looking at this browser sees after somebody
 * else chose an appearance somewhere: the screen changes, with nothing reloaded
 * and nothing polled. The socket is faked because it is the system boundary;
 * everything between the announcement and the painted scheme is the real
 * application, wired as `index.tsx` wires it.
 */
import { useTheme } from '@mui/material/styles';
import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { stubSystemColorScheme } from 'theme/src/testing/systemColorScheme';
import App from '../App';
import { carbonDark, carbonLight } from '.';

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

const Probe = (): JSX.Element => {
  const { design } = useTheme();
  return <div data-testid="probe" data-background={design?.background} />;
};

jest.mock('../components/smoke/smoke', () => ({ Smoke: () => <Probe /> }));
jest.mock('../components/history/history', () => ({ History: () => <Probe /> }));
jest.mock('../components/settings/settings', () => ({ Settings: () => <Probe /> }));
jest.mock('../../src/components/bottomBar/bottombar', () => ({
  BottomBar: () => <div />,
}));

let system: ReturnType<typeof stubSystemColorScheme>;

beforeEach(() => {
  localStorage.clear();
  handlers.clear();
  system = stubSystemColorScheme(false);
  // react-scripts sets resetMocks:true, wiping the factory implementations
  // before each test — re-establish them here.
  io.mockReturnValue(mockSocket);
  mockSocket.on.mockImplementation((event: string, handler: Handler) => {
    handlers.set(event, [...(handlers.get(event) ?? []), handler]);
  });
});

afterEach(() => system.restore());

/** The backend telling every connected client how the installation now looks. */
const announce = (preference: { mode: string; resolvedMode: string }): void =>
  act(() => {
    (handlers.get('appearance') ?? []).forEach(handler => handler(preference));
  });

const paintedBackground = (): string | null =>
  screen.getAllByTestId('probe')[0].getAttribute('data-background');

describe('an appearance chosen on another client while this one is open', () => {
  it('repaints this browser without it being reloaded', () => {
    render(<App />);
    expect(paintedBackground()).toBe(carbonLight.background);

    announce({ mode: 'dark', resolvedMode: 'dark' });

    expect(paintedBackground()).toBe(carbonDark.background);
  });
});
