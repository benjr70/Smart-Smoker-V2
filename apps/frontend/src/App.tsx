import { Grid } from '@mui/material';
import React from 'react';
import { BottomBar } from '../src/components/bottomBar/bottombar';
import './App.css';
import { Screens } from './components/common/interfaces/enums';
import { History } from './components/history/history';
import { Settings } from './components/settings/settings';
import { Smoke } from './components/smoke/smoke';

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

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  componentDidMount() {
    const envUrl = process.env.REACT_APP_CLOUD_URL;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(registration => {
          if ('PushManager' in window) {
            registration.pushManager
              .subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(process.env.VAPID_PUBLIC_KEY),
              })
              .then(subscription => {
                // Send the subscription to the server
                fetch(`${envUrl}notifications/subscribe`, {
                  method: 'POST',
                  body: JSON.stringify(subscription),
                  headers: {
                    'Content-Type': 'application/json',
                  },
                });
              })
              .catch(error => {
                console.error('Failed to subscribe the user: ', error);
              });
          }
        })
        .catch(error => {
          console.error('Service Worker registration failed: ', error);
        });
    }
  }

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
      <Grid className="App-header">
        <Grid>{screen}</Grid>
        <BottomBar
          smokeOnClick={this.smokeOnClick}
          reviewOnClick={this.reviewOnClick}
          settingsOnClick={this.settingsOnClick}
        ></BottomBar>
      </Grid>
    );
  }
}

export default App;
