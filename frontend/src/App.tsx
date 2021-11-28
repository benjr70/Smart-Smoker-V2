import React from 'react';
import './App.css';
import { BottomBar } from '../src/components/bottomBar/bottombar'

function App() {

  const homeOnClick = () => {
    console.log('on home click');
  }
  const historyOnClick = () => {
    console.log('on history click');
  }
  const settingsOnClick = () => {
    console.log('on settings click');
  }

  return (
    <div className="App">
      <header className="App-header">
      <BottomBar
      homeOnClick={homeOnClick}
      historyOnClick={historyOnClick}
      settingsOnClick={settingsOnClick}></BottomBar>
      </header>
    </div>
  );
}

export default App;
