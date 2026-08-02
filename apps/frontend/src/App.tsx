import { Grid, ThemeProvider } from '@mui/material';
import React from 'react';
import { BottomBar } from '../src/components/bottomBar/bottombar';
import { SnackbarProvider } from './api';
import './App.css';
import { Screens } from './components/common/interfaces/enums';
import { History } from './components/history/history';
import { Settings } from './components/settings/settings';
import { Smoke } from './components/smoke/smoke';
import { appTheme } from './theme';

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
      <ThemeProvider theme={appTheme}>
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
      </ThemeProvider>
    );
  }
}

export default App;
