/**
 * What the Model library asks of the phone it is on: whether it can run Voice
 * Fill at all, and whether it is online.
 */
import type { ConnectionPort } from './modelLibrary';

/** The parts of a browser window the capability check reads. */
export interface PhoneEnvironment {
  crossOriginIsolated?: boolean;
  navigator: {
    mediaDevices?: { getUserMedia?: unknown };
    gpu?: { requestAdapter(): Promise<unknown> };
  };
}

/**
 * Whether this phone can run Voice Fill: it has a microphone API, WebGPU gives
 * it an adapter, and the page is cross-origin isolated (the threaded speech
 * model needs `SharedArrayBuffer`). Nothing else is asked — no list of device
 * names — so a desktop browser that passes is offered it too.
 *
 * Where any of the three is missing, Voice Fill is absent: no button, no pill,
 * no settings card.
 */
export const canRunVoiceFill = async (
  phone: PhoneEnvironment = window as unknown as PhoneEnvironment
): Promise<boolean> => {
  if (phone.crossOriginIsolated !== true) {
    return false;
  }
  if (typeof phone.navigator.mediaDevices?.getUserMedia !== 'function') {
    return false;
  }
  if (!phone.navigator.gpu) {
    return false;
  }
  try {
    return (await phone.navigator.gpu.requestAdapter()) != null;
  } catch {
    return false;
  }
};

/** The browser's own word on whether it is online. */
export const browserConnection = (browser: Window = window): ConnectionPort => ({
  isOnline: () => browser.navigator.onLine,
  subscribe: listener => {
    browser.addEventListener('online', listener);
    browser.addEventListener('offline', listener);
    return () => {
      browser.removeEventListener('online', listener);
      browser.removeEventListener('offline', listener);
    };
  },
});
