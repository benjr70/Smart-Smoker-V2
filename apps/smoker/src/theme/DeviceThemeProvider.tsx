import { GlobalStyles, Theme, ThemeProvider, createTheme } from '@mui/material';
import React, { useEffect, useRef, useState } from 'react';
import {
  ColorScheme,
  DEVICE_DEFAULT_COLOR_SCHEME,
  appTheme,
  carbonLight,
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
 * The typeface the touchscreen already ships. The shared theme also carries the
 * design's typeface, which this device has no bundled faces for and, on a
 * tailnet, no route to fetch — asking for it would silently drop the interface
 * onto whatever sans-serif the appliance happens to have. The recolour is a
 * matter of the palette, so the palette is taken from the shared theme and the
 * typography is left exactly as it was: Material-UI's Roboto stack, which the
 * app bundles.
 */
const DEVICE_TYPOGRAPHY = createTheme().typography;

/**
 * The shared theme's palette for a scheme, painted through the component
 * library, over the device's own typography.
 */
const deviceTheme = (colorScheme: ColorScheme): Theme =>
  createTheme(withDesignPalette(createAppTheme(colorScheme)), { typography: DEVICE_TYPOGRAPHY });

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

/**
 * The colour for anything drawn on a panel the device still paints light.
 *
 * The chart is the one such panel: it paints itself a light grey of its own and
 * draws its axes and labels in the colour it inherits, and restyling it belongs
 * with the chart rather than with this recolour. Until then it is handed the
 * light palette's text — the same answer the web application reaches for when a
 * screen it has not restyled is still painted against a light shell (see
 * `withLightColorScheme` in the shared theme).
 */
const lightPanelCssVariables = { '--smoker-chart-text': carbonLight.text };

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
      <GlobalStyles
        styles={{ ':root': { ...cssVariables[colorScheme], ...lightPanelCssVariables } }}
      />
      {children}
    </ThemeProvider>
  );
}
