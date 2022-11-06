import React from 'react';
import './App.css';
import { BottomBar } from '../src/components/bottomBar/bottombar'
import { Screens } from './components/common/interfaces/enums';
import { history } from './components/history/history';
import { Smoke } from './components/smoke/smoke';
import { settings } from './components/settings/settings';

class App extends React.Component<{},{currentScreen: Screens}>{
  constructor(props: any) {
    super(props);
    this.smokeOnClick = this.smokeOnClick.bind(this);
    this.reviewOnClick = this.reviewOnClick.bind(this);
    this.settingsOnClick = this.settingsOnClick.bind(this);
    this.state = {currentScreen: Screens.HOME};
  }

   smokeOnClick() {
    this.setState({currentScreen: Screens.HOME})
  }
   reviewOnClick() {
    this.setState({currentScreen: Screens.HISTORY})
  }
   settingsOnClick() {
    this.setState({currentScreen: Screens.SETTINGS})
  }
    
  render(){

    let screen;
    switch(this.state.currentScreen){
      case Screens.HOME:
        screen = <Smoke/>;
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
        smokeOnClick={this.smokeOnClick}
        reviewOnClick={this.reviewOnClick}
        settingsOnClick={this.settingsOnClick}></BottomBar>
        </header>
      </div>
    );
  }

}

export default App;
