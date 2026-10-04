import React, { createContext, useContext, useMemo } from 'react';
import type { ExtractorPort, SpeechPort } from './ports';

/** The two models Voice Fill runs a Ramble through, and the clock it times one by. */
export interface VoiceFillPorts {
  speech: SpeechPort;
  extractor: ExtractorPort;
  now?: () => Date;
}

const VoiceFillPortsContext = createContext<VoiceFillPorts | null>(null);

export interface VoiceFillPortsProviderProps extends VoiceFillPorts {
  children: React.ReactNode;
}

/**
 * Hands the screens under it the models Voice Fill uses. A screen with no
 * provider above it has no Voice Fill: the button is offered only where there
 * is something behind it.
 */
export function VoiceFillPortsProvider({
  speech,
  extractor,
  now,
  children,
}: VoiceFillPortsProviderProps): JSX.Element {
  const ports = useMemo(() => ({ speech, extractor, now }), [speech, extractor, now]);
  return <VoiceFillPortsContext.Provider value={ports}>{children}</VoiceFillPortsContext.Provider>;
}

/** The models provided to this screen, or nothing where none are. */
export const useVoiceFillPorts = (): VoiceFillPorts | null => useContext(VoiceFillPortsContext);
