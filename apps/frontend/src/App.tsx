import { Experimental_CssVarsProvider as CssVarsProvider, Grid } from '@mui/material';
import React from 'react';
import { BottomBar } from '../src/components/bottomBar/bottombar';
import { SnackbarProvider } from './api';
import './App.css';
import { Screens } from './components/common/interfaces/enums';
import { History } from './components/history/history';
import { Settings } from './components/settings/settings';
import { Smoke } from './components/smoke/smoke';
import { UnrestyledScreen, appTheme } from './theme';

/**
 * The screens the design has reached. Everything else is still painted by hand,
 * against the light-grey shell `App.css` gives it, so it is held on the light
 * palette rather than handed the scheme in effect — a screen is taken off this
 * list's other side as the slice that recolours it lands.
 */
const RESTYLED_SCREENS: ReadonlySet<Screens> = new Set([Screens.SETTINGS]);

class App extends React.Component<{}, { currentScreen: Screens }> {
  constructor(props: any) {
    super(props);
    this.smokeOnClick = this.smokeOnClick.bind(this);
    this.reviewOnClick = this.reviewOnClick.bind(this);
    this.settingsOnClick = this.settingsOnClick.bind(this);
    this.state = { currentScreen: Screens.HOME };
  }

  smokeOnClick() {
    this.setState({ currentScreen: Screens.HOME });
  }
  reviewOnClick() {
    this.setState({ currentScreen: Screens.HISTORY });
  }
  settingsOnClick() {
    this.setState({ currentScreen: Screens.SETTINGS });
  }

  // NOTE: this component used to subscribe to push on mount — silently, with no
  // user gesture (so the permission prompt was never shown), using a VAPID key
  // read from a build-time environment variable that never made it into the
  // bundle. Subscription is now driven from the settings Notifications card,
  // where a click supplies the gesture and the key is read from the backend at
  // subscribe time (see src/push).

  render() {
    let screen;
    switch (this.state.currentScreen) {
      case Screens.HOME:
        screen = <Smoke />;
        break;
      case Screens.HISTORY:
        screen = <History />;
        break;
      case Screens.SETTINGS:
        screen = <Settings />;
        break;
    }

    return (
      // The application theme carries both colour schemes; this provider decides
      // which of them is in effect, puts it on the document and emits each
      // scheme's tokens as custom properties. `system` is the default, so a
      // browser that has never been told otherwise follows the device — and
      // keeps following it, live, while the page is open.
      <CssVarsProvider theme={appTheme} defaultMode="system">
        <SnackbarProvider>
          <Grid className="App-header">
            <Grid>
              {RESTYLED_SCREENS.has(this.state.currentScreen) ? (
                screen
              ) : (
                <UnrestyledScreen>{screen}</UnrestyledScreen>
              )}
            </Grid>
            {/* The bottom navigation is restyled in a later slice too, so it
                stays on the light palette alongside the screens it switches
                between — including while a restyled screen is open. */}
            <UnrestyledScreen>
              <BottomBar
                smokeOnClick={this.smokeOnClick}
                reviewOnClick={this.reviewOnClick}
                settingsOnClick={this.settingsOnClick}
              ></BottomBar>
            </UnrestyledScreen>
          </Grid>
        </SnackbarProvider>
      </CssVarsProvider>
    );
  }
}

export default App;
