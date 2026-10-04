import React, { useEffect, useMemo, useState } from 'react';
import { FILLED_FLASH_MS } from '../components/common/components/FormField';
import type { VoiceFillScreenValues } from './extractionContract';
import type { VoiceFillScreen } from './fieldDefinition';
import type { ScreenBinding, VoiceFillSession, VoiceFillState } from './session';
import { createVoiceFillSession } from './session';
import { VoiceFillButton, VoiceFillToast } from './VoiceFillControls';
import { useVoiceFillPorts } from './VoiceFillPortsProvider';
import { VoiceFillSheet } from './VoiceFillSheet';

/** How long a filled field flashes, in ms. */
export const FLASH_MS = FILLED_FLASH_MS;

export interface VoiceFill<Values> {
  /** Whether the screen has Voice Fill at all: whether models are provided to it. */
  offered: boolean;
  /**
   * The button, the sheet and the toast — whichever of them is up — for the
   * screen to render once, anywhere; nothing where Voice Fill is not offered.
   */
  controls: JSX.Element | null;
  /**
   * `field` while it is flashing from a fill, and nothing otherwise: what a
   * screen hands the field it draws that value in.
   */
  filled: (field: keyof Values & string) => (keyof Values & string) | undefined;
}

const IDLE = { phase: 'idle' } as const;
const NOTHING: readonly string[] = [];

/**
 * Voice Fill for one screen: a session over the provided models and the
 * screen's binding, the controls that drive it, and which fields are flashing.
 */
export const useVoiceFill = <Screen extends VoiceFillScreen>(
  screen: Screen,
  binding: ScreenBinding<VoiceFillScreenValues[Screen]>
): VoiceFill<VoiceFillScreenValues[Screen]> => {
  type Values = VoiceFillScreenValues[Screen];
  const ports = useVoiceFillPorts();

  const session = useMemo<VoiceFillSession<Values> | null>(
    () => (ports ? createVoiceFillSession({ screen, binding, ...ports }) : null),
    [ports, screen, binding]
  );
  const [state, setState] = useState<VoiceFillState<Values>>(IDLE);
  const [flashing, setFlashing] = useState<readonly string[]>(NOTHING);

  useEffect(() => {
    if (!session) {
      return undefined;
    }
    setState(session.getState());
    const unsubscribe = session.subscribe(() => setState(session.getState()));
    return () => {
      unsubscribe();
      // A screen that is left takes its Ramble with it: the microphone is
      // released and no timer is left to fire at a screen that has gone. A
      // fill already made stands.
      session.cancel();
      session.dismiss();
    };
  }, [session]);

  // The filled fields flash from the moment they are written, and stop: when
  // the flash has run its time, or at once if the fill is undone.
  useEffect(() => {
    if (state.phase !== 'applied') {
      setFlashing(NOTHING);
      return undefined;
    }
    setFlashing(state.fields);
    const timer = setTimeout(() => setFlashing(NOTHING), FLASH_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const controls = session ? (
    <>
      {state.phase === 'idle' && <VoiceFillButton onClick={session.start} />}
      <VoiceFillSheet
        screen={screen}
        state={state}
        onDoneTalking={session.doneTalking}
        onToggle={session.toggle}
        onFill={session.fill}
        onClose={session.cancel}
      />
      {state.phase === 'applied' && <VoiceFillToast count={state.count} onUndo={session.undo} />}
    </>
  ) : null;

  return {
    offered: session !== null,
    controls,
    filled: field => (flashing.includes(field) ? field : undefined),
  };
};
