/**
 * Wiring the shared appearance preference into the application.
 *
 * The colour-scheme provider owns what this browser paints and persists that
 * choice locally, which is what makes the first paint instant. This provider
 * puts the installation-wide preference alongside it: on mount it reconciles
 * what the backend holds with what this browser is already showing, and a choice
 * made through {@link useAppearanceChoice} is published rather than kept to
 * itself.
 */
import { useColorScheme } from '@mui/material/styles';
import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { AppearanceMode } from 'theme/src';
import { useApiClient } from '../api';
import {
  AppearanceSubscriptionPort,
  createAppearanceStore,
  noAppearanceSubscription,
} from './appearanceStore';

/** Choosing a mode: repaint now, publish if the installation does not know. */
export type AppearanceChoice = (mode: AppearanceMode) => void;

const SharedAppearanceContext = createContext<AppearanceChoice | null>(null);

export interface SharedAppearanceProviderProps {
  /**
   * How this client hears that another one changed the preference. What carries
   * it is wired in a later slice; until then nothing is announced.
   */
  subscription?: AppearanceSubscriptionPort;
  children: React.ReactNode;
}

export const SharedAppearanceProvider = ({
  subscription = noAppearanceSubscription,
  children,
}: SharedAppearanceProviderProps): JSX.Element => {
  const client = useApiClient().appearance;
  const { mode, setMode, systemMode } = useColorScheme();

  // The colour-scheme hook hands back fresh values on every render, while the
  // store holds its cache for as long as it lives. Reading through refs is what
  // lets the store ask "what is on screen *now*" instead of closing over what
  // was on screen when it was built.
  const latest = useRef({ mode, setMode, systemMode });
  latest.current = { mode, setMode, systemMode };

  const store = useMemo(
    () =>
      createAppearanceStore({
        cache: {
          readMode: () => (latest.current.mode as AppearanceMode | undefined) ?? null,
          systemDark: () => latest.current.systemMode === 'dark',
          apply: chosen => latest.current.setMode(chosen),
        },
        client,
        subscription,
      }),
    [client, subscription]
  );

  useEffect(() => {
    void store.start();
    return () => store.stop();
  }, [store]);

  const choose = useMemo<AppearanceChoice>(() => chosen => void store.choose(chosen), [store]);

  return (
    <SharedAppearanceContext.Provider value={choose}>{children}</SharedAppearanceContext.Provider>
  );
};

/**
 * How a control changes the appearance.
 *
 * Without the provider the choice is local to this browser: the control still
 * repaints the app, it simply has nowhere to publish to. That keeps the control
 * renderable on its own, and keeps "does this installation share its
 * appearance?" a question about how the app is assembled rather than one every
 * control has to answer.
 */
export const useAppearanceChoice = (): AppearanceChoice => {
  const { setMode } = useColorScheme();
  const shared = useContext(SharedAppearanceContext);
  return shared ?? (chosen => setMode(chosen));
};
