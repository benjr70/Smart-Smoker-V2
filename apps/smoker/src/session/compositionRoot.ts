import {
  SessionConfig,
  createCloudSocketAdapter,
  createDeviceFeedAdapter,
} from 'smoke-session/src';
import { createSmokerSessionApi } from './sessionApiAdapter';
import { createWifiStatusAdapter } from './wifiStatusAdapter';

/** The device-service serial bridge the touchscreen consumes locally. */
const DEVICE_SERVICE_URL = 'http://127.0.0.1:3003';

/**
 * Cap the wifi probe to at most one device-service round trip per this window,
 * regardless of the serial reading rate (the legacy home screen probed on every
 * reading; the store now throttles).
 */
const WIFI_PROBE_THROTTLE_MS = 5000;

/**
 * The smoker app's composition root: the one place env/URL reads happen and the
 * one place the concrete socket, serial, HTTP, and wifi adapters are wired into
 * a {@link SessionConfig}. Wifi probing is enabled only in production, matching
 * the legacy `process.env.ENV === 'production'` connection-check gate; outside
 * production the store never probes and the indicator stays connected.
 */
export function createSmokerSessionConfig(): SessionConfig {
  const cloudUrl = process.env.REACT_APP_CLOUD_URL ?? '';

  const config: SessionConfig = {
    role: 'smoker',
    socket: createCloudSocketAdapter(cloudUrl),
    deviceFeed: createDeviceFeedAdapter(DEVICE_SERVICE_URL),
    api: createSmokerSessionApi(),
    clock: { now: () => new Date() },
  };

  if (process.env.ENV === 'production') {
    config.wifi = {
      port: createWifiStatusAdapter(),
      throttleMs: WIFI_PROBE_THROTTLE_MS,
    };
  }

  return config;
}
