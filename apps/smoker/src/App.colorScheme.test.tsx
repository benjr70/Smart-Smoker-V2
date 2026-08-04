/**
 * The colour scheme the touchscreen renders in is decided at the application
 * root, and on this device it is decided once: the smoker is a fixed appliance
 * in a garage, not a browser someone has preferences in.
 *
 * The home screen is replaced with a probe that reports the theme it is handed,
 * so the assertions are about what the application gives its screens rather
 * than about how any one screen paints itself.
 */
import { useTheme } from '@mui/material/styles';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { carbonDark } from 'theme/src';
import App from './App';

const Probe = (): JSX.Element => {
  const { design, palette } = useTheme();
  return (
    <div
      data-testid="probe"
      data-background={design?.background}
      data-surface={design?.surface}
      data-border={design?.border}
      data-text={palette.text.primary}
    />
  );
};

jest.mock('./components/home/home', () => ({ Home: () => <Probe /> }));

describe('the colour scheme the touchscreen renders in', () => {
  it('is the Carbon dark palette, with nothing asked and nothing stored', () => {
    render(<App />);

    expect(screen.getByTestId('probe')).toHaveAttribute('data-background', carbonDark.background);
    expect(screen.getByTestId('probe')).toHaveAttribute('data-surface', carbonDark.surface);
    expect(screen.getByTestId('probe')).toHaveAttribute('data-border', carbonDark.border);
    expect(screen.getByTestId('probe')).toHaveAttribute('data-text', carbonDark.text);
  });
});

/**
 * The two sources a browser would normally settle its appearance from, and the
 * two this appliance must not touch: the display's own preference, which reads
 * "light" however dark the garage is, and a remembered choice, which nobody is
 * at the device to make.
 */
describe('what the touchscreen asks the device it is running on', () => {
  let media: jest.Mock;

  beforeEach(() => {
    media = jest.fn(
      (query: string) =>
        ({
          media: query,
          matches: true,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        }) as unknown as MediaQueryList
    );
    (window as unknown as { matchMedia: unknown }).matchMedia = media;
    localStorage.clear();
    jest.spyOn(Storage.prototype, 'getItem');
    jest.spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as Partial<Window> as { matchMedia?: unknown }).matchMedia;
  });

  it('never asks the display which colour scheme it prefers', () => {
    render(<App />);

    const colourSchemeQueries = media.mock.calls
      .map(([query]) => String(query))
      .filter(query => query.includes('color-scheme'));
    expect(colourSchemeQueries).toEqual([]);
  });

  it('neither reads nor writes a remembered appearance', () => {
    render(<App />);

    expect(Storage.prototype.getItem).not.toHaveBeenCalled();
    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });
});
