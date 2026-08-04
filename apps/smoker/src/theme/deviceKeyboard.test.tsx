/**
 * The on-screen keyboard, which is how a wifi password gets into this device.
 *
 * The field it goes into shows dots, and there is no cursor to watch on an
 * 800x480 panel being poked with a thumb, so the key going down is the only
 * confirmation the operator gets that the tap landed on the key they meant. The
 * keyboard is a third-party leaf with its own light theme; the recolour repaints
 * it, and this is about what survives that repaint.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { Wifi } from '../components/home/wifi/wifi';
import { getConnection } from '../services/deviceService';
import { DeviceThemeProvider } from './DeviceThemeProvider';
import {
  backgroundColourAt,
  contrastRatio,
  relativeLuminance,
  serveDeviceStylesheets,
  stopServingDeviceStylesheets,
} from './testing/deviceColours';

jest.mock('../services/deviceService', () => ({
  connectToWiFi: jest.fn(),
  getConnection: jest.fn(),
}));

/** The keyboard as it sits on the wifi screen: the slab and the keys on it. */
const showTheKeyboard = async (): Promise<{ slab: Element; keys: Element[] }> => {
  render(
    <DeviceThemeProvider>
      <Wifi onBack={jest.fn()} />
    </DeviceThemeProvider>
  );
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  // The keyboard is a third-party leaf that renders neither roles nor labels —
  // its slab and keys are reachable only as the elements the library makes them,
  // which is also how the stylesheet reaches them.
  return {
    /* eslint-disable testing-library/no-node-access */
    slab: document.querySelector('.hg-theme-default') as Element,
    keys: Array.from(document.querySelectorAll('.hg-button')),
    /* eslint-enable testing-library/no-node-access */
  };
};

beforeEach(() => {
  (getConnection as jest.Mock).mockResolvedValue([]);
  serveDeviceStylesheets();
});

afterEach(() => stopServingDeviceStylesheets());

describe('the key an operator is holding down', () => {
  it('is a colour of its own, not the slab it sits in and not a key at rest', async () => {
    const { slab, keys } = await showTheKeyboard();
    const [held, atRest] = keys;

    fireEvent.mouseDown(held);

    // Far enough apart to be seen at a glance, rather than merely a different
    // set of hex digits.
    expect(contrastRatio(backgroundColourAt(held), backgroundColourAt(slab))).toBeGreaterThan(1.5);
    expect(contrastRatio(backgroundColourAt(held), backgroundColourAt(atRest))).toBeGreaterThan(
      1.5
    );
  });
});

/**
 * The keyboard's own design has the keys standing out of the slab they sit on —
 * white keys on an off-white slab. On a dark screen that relationship is the
 * same one: the keys are the lighter of the two, and the slab is the surface
 * they are laid on.
 */
describe('a key at rest', () => {
  it('is lighter than the slab it sits in', async () => {
    const { slab, keys } = await showTheKeyboard();

    expect(relativeLuminance(backgroundColourAt(keys[0]))).toBeGreaterThan(
      relativeLuminance(backgroundColourAt(slab))
    );
  });
});
