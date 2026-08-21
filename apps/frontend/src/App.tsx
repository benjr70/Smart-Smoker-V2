import { Experimental_CssVarsProvider as CssVarsProvider, Grid } from '@mui/material';
import React from 'react';
import { BottomBar } from '../src/components/bottomBar/bottombar';
import { SnackbarProvider } from './api';
import './App.css';
import { Screens } from './components/common/interfaces/enums';
import { History } from './components/history/history';
import { Settings } from './components/settings/settings';
import { Smoke } from './components/smoke/smoke';
import { Stats } from './components/stats/stats';
import { DesignSurface, appTheme } from './theme';
import { SharedAppearanceProvider } from './theme/SharedAppearance';
import { createSocketAppearanceSubscription } from './theme/socketAppearanceSubscription';

/**
 * How this browser hears that another client changed the appearance: the
 * websocket the application already speaks. Built once, and it opens no
 * connection until the provider subscribes.
 */
const appearanceAnnouncements = createSocketAppearanceSubscription();

class App extends React.Component<{}, { currentScreen: Screens }> {
  constructor(props: any) {
    super(props);
    this.smokeOnClick = this.smokeOnClick.bind(this);
    this.historyOnClick = this.historyOnClick.bind(this);
    this.statsOnClick = this.statsOnClick.bind(this);
    this.settingsOnClick = this.settingsOnClick.bind(this);
    this.state = { currentScreen: Screens.HOME };
  }

  smokeOnClick() {
    this.setState({ currentScreen: Screens.HOME });
  }
  historyOnClick() {
    this.setState({ currentScreen: Screens.HISTORY });
  }
  statsOnClick() {
    this.setState({ currentScreen: Screens.STATS });
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
        // Finishing a smoke ends on the design's completion screen, whose one
        // action is to go and look at what was just archived. The wizard has no
        // idea how this application navigates, so it asks and this decides.
        // The completion card's no-probe prompt is the second way out of the
        // wizard that is not a tap on the bar: it asks for the settings screen,
        // and this is what knows where that is.
        screen = (
          <Smoke onViewHistory={this.historyOnClick} onOpenSettings={this.settingsOnClick} />
        );
        break;
      case Screens.HISTORY:
        screen = <History />;
        break;
      case Screens.STATS:
        screen = <Stats />;
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
            is themed by the outcome. It also listens on the application's
            websocket, so an appearance chosen anywhere in the installation
            reaches this browser while it is open rather than at its next
            load. */}
        <SharedAppearanceProvider subscription={appearanceAnnouncements}>
          {/* Every screen is recoloured now, so the design's palette is applied
              once, here, rather than opted into a screen at a time. */}
          <DesignSurface>
            <SnackbarProvider>
              <Grid className="App-header">
                <Grid>{screen}</Grid>
                <BottomBar
                  // The screen in effect lives here, so the bar is told it
                  // rather than keeping a second copy that only a tap on the
                  // bar could update — the completion screen navigates without
                  // one.
                  currentScreen={this.state.currentScreen}
                  smokeOnClick={this.smokeOnClick}
                  historyOnClick={this.historyOnClick}
                  statsOnClick={this.statsOnClick}
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
