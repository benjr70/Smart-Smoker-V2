// The design typeface, bundled with the app: the four weights the design sets
// its text in, served from this appliance's own bundle because the box may
// have no route to any font host at all (see `selfHostedFont.test.ts`).
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import { GlobalStyles, Theme, ThemeProvider, createTheme } from '@mui/material';
import React, { useEffect, useRef, useState } from 'react';
import {
  ColorScheme,
  DEVICE_DEFAULT_COLOR_SCHEME,
  appTheme,
  createAppTheme,
  withDesignPalette,
} from 'theme/src';
import { getDefaultApiClient } from '../api/client';
import {
  DeviceAppearanceAdapter,
  DeviceAppearanceReadPort,
  DeviceAppearanceSubscriptionPort,
  createDeviceAppearanceAdapter,
} from './deviceAppearance';
import { createSocketAppearanceSubscription } from './socketAppearanceSubscription';

/**
 * The shared theme's palette for a scheme, painted through the component
 * library. The typography is the shared theme's too — the design typeface,
 * whose faces this app now bundles itself (imported above), so taking it no
 * longer means asking a network the box may not have.
 */
const deviceTheme = (colorScheme: ColorScheme): Theme =>
  createTheme(withDesignPalette(createAppTheme(colorScheme)));

/**
 * Both themes, and both sets of custom properties, built once.
 *
 * The device has only two appearances it can ever be in, and it switches
 * between them the moment a phone says so — rebuilding a theme on the way is
 * work an 800MHz appliance does not need to do twice.
 */
const themes: Record<ColorScheme, Theme> = {
  light: deviceTheme('light'),
  dark: deviceTheme('dark'),
};

/**
 * Each scheme's tokens as custom properties, so the device's legacy stylesheets
 * can name a colour from the shared palette instead of repeating a hex value.
 * These are the same property names the web application's colour-scheme provider
 * puts on `:root`, so a rule written against one application reads the same in
 * the other.
 */
const cssVariables: Record<ColorScheme, Record<string, string | number>> = {
  light: appTheme.generateCssVars('light').css,
  dark: appTheme.generateCssVars('dark').css,
};

/** Where the device hears the installation's appearance from. */
export interface DeviceAppearanceSource {
  client: DeviceAppearanceReadPort;
  subscription?: DeviceAppearanceSubscriptionPort;
}

export interface DeviceThemeProviderProps {
  /**
   * The boot read and the announcement channel. Defaults to the ones this
   * appliance runs on; a tree assembled with its own hears whatever that one
   * says instead.
   */
  appearance?: DeviceAppearanceSource;
  children: React.ReactNode;
}

/** The ports the appliance itself runs on, built once on first use. */
let productionAppearance: DeviceAppearanceSource | undefined;
const deviceAppearanceSource = (): DeviceAppearanceSource => {
  if (!productionAppearance) {
    productionAppearance = {
      client: getDefaultApiClient().appearance,
      subscription: createSocketAppearanceSubscription(),
    };
  }
  return productionAppearance;
};

/**
 * Provides the shared theme to the touchscreen, in the scheme the installation
 * resolved for it.
 *
 * Deliberately not the component library's colour-scheme provider: that one
 * exists to resolve a scheme from the machine it runs on and remember the
 * answer, and it reads the colour-scheme media query and local storage to do so
 * — the two things this device must never do. What it renders instead is the
 * value a browser resolved and recorded, read at boot and replaced whenever one
 * is announced. There is no write path here to disable, because there is none at
 * all.
 */
export function DeviceThemeProvider({
  appearance,
  children,
}: DeviceThemeProviderProps): JSX.Element {
  // Dark until the backend says otherwise: the panel hangs in a garage, and the
  // wrong answer there is a sheet of white in a dark room.
  const [colorScheme, setColorScheme] = useState<ColorScheme>(DEVICE_DEFAULT_COLOR_SCHEME);

  // Wired exactly once for the life of the tree, the way the application root
  // builds its session config: the socket and the boot read belong to the
  // appliance being switched on, not to a render — and the scheme changing is
  // itself a render, so anything rebuilt here would tear the connection down
  // every time a phone changed the colour.
  const adapterRef = useRef<DeviceAppearanceAdapter | null>(null);
  if (adapterRef.current === null) {
    const source = appearance ?? deviceAppearanceSource();
    adapterRef.current = createDeviceAppearanceAdapter({
      client: source.client,
      subscription: source.subscription,
      apply: setColorScheme,
    });
  }
  const adapter = adapterRef.current;

  useEffect(() => {
    void adapter.start();
    return () => adapter.stop();
  }, [adapter]);

  return (
    <ThemeProvider theme={themes[colorScheme]}>
      <GlobalStyles styles={{ ':root': cssVariables[colorScheme] }} />
      {children}
    </ThemeProvider>
  );
}
