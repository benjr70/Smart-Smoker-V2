/**
 * The device's legacy stylesheets name their colours from the shared palette
 * instead of repeating hex values, which only works while the application root
 * actually provides the properties they name. Nothing else would notice if it
 * stopped: an unknown custom property is not an error, it is simply no colour,
 * and the touchscreen would come up transparent on black with every test still
 * green.
 *
 * So this asserts the contract rather than the names — the names are read out of
 * the stylesheets themselves, and the only claim is that the application
 * provides each one it finds.
 */
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import React from 'react';
import { DeviceThemeProvider } from './DeviceThemeProvider';
import { deviceStylesheets } from './testing/deviceColours';

/** Every custom property the touchscreen's own stylesheets read a colour from. */
const propertiesReferencedByTheDevice = (): string[] => {
  const stylesheets = deviceStylesheets().join('\n');
  return Array.from(new Set(Array.from(stylesheets.matchAll(/var\((--[\w-]+)\)/g), m => m[1])));
};

/** Every custom property the application declares once it is on screen. */
const propertiesProvidedByTheApp = (): string => {
  render(
    <DeviceThemeProvider>
      <div />
    </DeviceThemeProvider>
  );
  return Array.from(document.styleSheets)
    .flatMap(sheet => Array.from(sheet.cssRules, rule => rule.cssText))
    .join('\n');
};

describe('the colours the touchscreen stylesheets ask the theme for', () => {
  it('are all provided by the application', () => {
    const referenced = propertiesReferencedByTheDevice();
    const provided = propertiesProvidedByTheApp();

    // Guards the reading above: a stylesheet that stopped naming any of them
    // would otherwise make the assertion below vacuously true.
    expect(referenced.length).toBeGreaterThan(0);
    referenced.forEach(property => expect(provided).toContain(`${property}:`));
  });
});
