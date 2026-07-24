import './App.css';
import { Home } from './components/home/home';
import React, { useRef } from 'react';
import { SessionConfig } from 'smoke-session/src';
import { SmokeSessionProvider } from 'smoke-session/src/react';
import { createSmokerSessionConfig } from './session/compositionRoot';

function App() {
  // Build the composition-root config exactly once for the app's lifetime so the
  // cloud/device sockets live and die with the Provider, never re-created on a
  // re-render.
  const configRef = useRef<SessionConfig | null>(null);
  if (configRef.current === null) {
    configRef.current = createSmokerSessionConfig();
  }

  return (
    <div className="App">
      <SmokeSessionProvider config={configRef.current}>
        <Home />
      </SmokeSessionProvider>
    </div>
  );
}

export default App;
