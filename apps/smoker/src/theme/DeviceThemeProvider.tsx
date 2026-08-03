import { GlobalStyles, ThemeProvider, createTheme } from '@mui/material';
import React from 'react';
import { ColorScheme, appTheme, createAppTheme, withDesignPalette } from 'theme/src';

/**
 * The colour scheme the touchscreen renders in, decided here and nowhere else.
 *
 * The device is an appliance bolted to a smoker in a garage. Its display reports
 * a light preference whatever the surroundings are, so following the browser's
 * `prefers-color-scheme` would light up a dark garage; and there is no operator
 * sitting at it choosing an appearance, so there is nothing to remember between
 * boots either. Following the appearance chosen for the account arrives in a
 * later slice, over the wire — not from anything this device can ask itself.
 */
const DEVICE_COLOR_SCHEME: ColorScheme = 'dark';

/**
 * The typeface the touchscreen already ships. The shared theme also carries the
 * design's typeface, which this device has no bundled faces for and, on a
 * tailnet, no route to fetch — asking for it would silently drop the interface
 * onto whatever sans-serif the appliance happens to have. This slice recolours
 * the device, so the palette is taken from the shared theme and the typography
 * is left exactly as it was: Material-UI's Roboto stack, which the app bundles.
 */
const DEVICE_TYPOGRAPHY = createTheme().typography;

/**
 * The one theme the touchscreen provides: the shared theme's dark palette,
 * painted through the component library, over the device's own typography.
 */
const deviceTheme = createTheme(withDesignPalette(createAppTheme(DEVICE_COLOR_SCHEME)), {
  typography: DEVICE_TYPOGRAPHY,
});

/**
 * The dark scheme's tokens as custom properties, so the device's legacy
 * stylesheets can name a colour from the shared palette instead of repeating a
 * hex value. These are the same property names the web application's
 * colour-scheme provider puts on `:root`, so a rule written against one
 * application reads the same in the other.
 */
const deviceCssVariables = appTheme.generateCssVars(DEVICE_COLOR_SCHEME).css;

/**
 * Provides the shared theme to the touchscreen, fixed to its dark scheme.
 *
 * Deliberately not the component library's colour-scheme provider: that one
 * exists to resolve a scheme from the device and remember the answer, and it
 * reads the colour-scheme media query and local storage to do so — the two
 * things this device must never do. There is no write path here to disable,
 * because there is none at all.
 */
export function DeviceThemeProvider({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <ThemeProvider theme={deviceTheme}>
      <GlobalStyles styles={{ ':root': deviceCssVariables }} />
      {children}
    </ThemeProvider>
  );
}
