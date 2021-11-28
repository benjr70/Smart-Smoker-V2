import React from 'react';
import './App.css';
import { BottomBar } from '../src/components/bottomBar/bottombar'
import { Screens } from './components/common/interfaces/enums';
import { history } from './components/history/history';
import { home } from './components/home/home';
import { settings } from './components/settings/settings';

class App extends React.Component<{},{currentScreen: Screens}>{
  constructor(props: any) {
    super(props);
    this.homeOnClick = this.homeOnClick.bind(this);
    this.historyOnClick = this.historyOnClick.bind(this);
    this.settingsOnClick = this.settingsOnClick.bind(this);
    this.state = {currentScreen: Screens.HOME};
  }

   homeOnClick() {
    this.setState({currentScreen: Screens.HOME})
  }
   historyOnClick() {
    this.setState({currentScreen: Screens.HISTORY})
  }
   settingsOnClick() {
    this.setState({currentScreen: Screens.SETTINGS})
  }
    
  render(){

    let screen;
    switch(this.state.currentScreen){
      case Screens.HOME:
        screen = home();
        break;
      case Screens.HISTORY:
        screen = history();
        break;
      case Screens.SETTINGS:
        screen = settings();
        break;
    }
  
      return (
      <div className="App">
        <header className="App-header">
        {screen}
        <BottomBar
        homeOnClick={this.homeOnClick}
        historyOnClick={this.historyOnClick}
        settingsOnClick={this.settingsOnClick}></BottomBar>
        </header>
      </div>
    );
  }

}

export default App;
