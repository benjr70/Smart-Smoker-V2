import React, { useEffect, useMemo, useState } from 'react';
import type { VoiceFillScreenValues } from './extractionContract';
import type { VoiceFillScreen } from './fieldDefinition';
import { FLASH_MS } from './FilledFlash';
import type { PairReadiness } from './modelLibrary';
import { pairReadiness } from './modelLibrary';
import { useModelLibrary } from './ModelLibraryProvider';
import type { ScreenBinding, VoiceFillSession, VoiceFillState } from './session';
import { createVoiceFillSession } from './session';
import { VoiceFillButton, VoiceFillPill, VoiceFillToast } from './VoiceFillControls';
import { useVoiceFillPorts } from './VoiceFillPortsProvider';
import { VoiceFillSheet } from './VoiceFillSheet';

export interface VoiceFill<Values> {
  /**
   * Whether the screen has Voice Fill at all: whether models are provided to
   * it, on a phone that can run them.
   */
  offered: boolean;
  /**
   * The button, the sheet and the toast — whichever of them is up — for the
   * screen to render once, anywhere; nothing where Voice Fill is not offered.
   */
  controls: JSX.Element | null;
  /**
   * Whether `field` is flashing from a fill: what a screen tells the
   * `FilledFlash` it draws that value in.
   */
  isFlashing: (field: keyof Values & string) => boolean;
}

export interface VoiceFillOptions {
  /**
   * Opens the place the models are picked: where "Change model" takes a cook
   * whose model has failed. The screen says how; Voice Fill only asks. A
   * screen that has no way there gives none, and "Change model" is not offered.
   */
  onChangeModel?: () => void;
}

const IDLE = { phase: 'idle' } as const;
const NOTHING: readonly string[] = [];
const READY: PairReadiness = { state: 'ready' };

/**
 * Voice Fill for one screen: a session over the provided models and the
 * screen's binding, the controls that drive it, and which fields are flashing.
 */
export const useVoiceFill = <Screen extends VoiceFillScreen>(
  screen: Screen,
  binding: ScreenBinding<VoiceFillScreenValues[Screen]>,
  { onChangeModel }: VoiceFillOptions = {}
): VoiceFill<VoiceFillScreenValues[Screen]> => {
  type Values = VoiceFillScreenValues[Screen];
  const models = useModelLibrary();
  const provided = useVoiceFillPorts();
  // Where the application keeps a Model library, it has the say on whether the
  // phone can run Voice Fill at all, and on whether the picked pair is ready.
  const ports = models && models.state.supported !== true ? null : provided;
  const readiness = models ? pairReadiness(models.library.registry, models.state) : READY;

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
      {state.phase === 'idle' &&
        (readiness.state === 'ready' || !models ? (
          <VoiceFillButton onClick={session.start} />
        ) : (
          <VoiceFillPill
            // A download paused offline is still on its way, so the pill keeps
            // its percent; what it waits for is said on the settings card.
            message={
              readiness.state === 'downloading'
                ? `Model downloading ${readiness.percent}%`
                : 'Download a voice model in Settings'
            }
            onClick={models.openSettings}
          />
        ))}
      <VoiceFillSheet
        screen={screen}
        state={state}
        onDoneTalking={session.doneTalking}
        onToggle={session.toggle}
        onFill={session.fill}
        onRetry={session.retry}
        onFixText={session.fixText}
        onRedo={session.redo}
        onChangeModel={
          onChangeModel &&
          (() => {
            // The Ramble does not come along: its transcript goes with the sheet.
            session.cancel();
            onChangeModel();
          })
        }
        onClose={session.cancel}
      />
      {state.phase === 'applied' && <VoiceFillToast count={state.count} onUndo={session.undo} />}
    </>
  ) : null;

  return {
    offered: session !== null,
    controls,
    isFlashing: field => flashing.includes(field),
  };
};
