import { Experimental_CssVarsProvider as CssVarsProvider, Grid } from '@mui/material';
import React from 'react';
import { BottomBar } from '../src/components/bottomBar/bottombar';
import { SnackbarProvider } from './api';
import './App.css';
import { Screens } from './components/common/interfaces/enums';
import { History } from './components/history/history';
import { Settings } from './components/settings/settings';
import { Smoke } from './components/smoke/smoke';
import { DesignSurface, appTheme } from './theme';
import { SharedAppearanceProvider } from './theme/SharedAppearance';

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
        {/* The appearance is one installation-wide preference, not a
            per-browser one: this reconciles what the backend holds with what
            this browser already painted, and publishes a choice made here. It
            sits inside the colour-scheme provider because that is what it
            reconciles with, and outside the screens so that every one of them
            is themed by the outcome. */}
        <SharedAppearanceProvider>
          {/* Every screen is recoloured now, so the design's palette is applied
              once, here, rather than opted into a screen at a time. */}
          <DesignSurface>
            <SnackbarProvider>
              <Grid className="App-header">
                <Grid>{screen}</Grid>
                <BottomBar
                  smokeOnClick={this.smokeOnClick}
                  reviewOnClick={this.reviewOnClick}
                  settingsOnClick={this.settingsOnClick}
                ></BottomBar>
              </Grid>
            </SnackbarProvider>
          </DesignSurface>
        </SharedAppearanceProvider>
      </CssVarsProvider>
    );
  }
}

export default App;
