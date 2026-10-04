import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ModelLibrary, ModelLibraryState } from './modelLibrary';

/** The Model library as a screen sees it. */
export interface ModelLibraryView {
  library: ModelLibrary;
  state: ModelLibraryState;
  /** Opens the settings screen at the Voice Fill card: what the grey pill does. */
  openSettings: () => void;
  /**
   * Whether the settings screen was opened to show the Voice Fill card. Asking
   * answers it: the card is brought into view once per request.
   */
  takeCardRequest: () => boolean;
}

const ModelLibraryContext = createContext<ModelLibraryView | null>(null);

export interface ModelLibraryProviderProps {
  library: ModelLibrary;
  /** Shows the settings screen. The application root knows how. */
  onOpenSettings?: () => void;
  children: React.ReactNode;
}

/**
 * Opens the phone's Model library and hands it to every screen under it.
 *
 * It sits at the application root, above whichever screen is up, so the
 * download that starts by itself the first time the app is opened starts on
 * any screen, and a download goes on while the user moves between them.
 */
export function ModelLibraryProvider({
  library,
  onOpenSettings,
  children,
}: ModelLibraryProviderProps): JSX.Element {
  const [state, setState] = useState(library.getState);
  const cardRequested = useRef(false);

  useEffect(() => {
    setState(library.getState());
    const unsubscribe = library.subscribe(() => setState(library.getState()));
    void library.open();
    return () => {
      unsubscribe();
      library.close();
    };
  }, [library]);

  const view = useMemo<ModelLibraryView>(
    () => ({
      library,
      state,
      openSettings: () => {
        cardRequested.current = true;
        onOpenSettings?.();
      },
      takeCardRequest: () => {
        const requested = cardRequested.current;
        cardRequested.current = false;
        return requested;
      },
    }),
    [library, state, onOpenSettings]
  );

  return <ModelLibraryContext.Provider value={view}>{children}</ModelLibraryContext.Provider>;
}

/** The phone's Model library, or nothing where the application provides none. */
export const useModelLibrary = (): ModelLibraryView | null => useContext(ModelLibraryContext);

/**
 * The Model library on a phone that can run Voice Fill; nothing on one that
 * cannot, or has not been checked yet. What the pill and the settings card are
 * drawn from, so neither exists where Voice Fill does not.
 */
export const useSupportedModelLibrary = (): ModelLibraryView | null => {
  const view = useModelLibrary();
  return view?.state.supported === true ? view : null;
};
