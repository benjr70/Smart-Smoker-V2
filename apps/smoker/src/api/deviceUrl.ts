/**
 * Where the smoker web bundle finds its device-service.
 *
 * The device-service normally runs on the same machine as the smoker UI, so both
 * call sites (the temp websocket and the wifi-manager REST calls) have always
 * dialled a loopback default. A hermetic per-PR stack instead publishes
 * device-service on a remapped host port, and the stack runner bakes that URL
 * into the bundle at image-build time as `REACT_APP_DEVICE_URL` (dotenv-webpack
 * inlines it; on a real device and in the default e2e stack the var is absent).
 *
 * Each caller supplies its own loopback fallback so an un-baked bundle keeps the
 * exact origin it used before this indirection existed.
 */
export const resolveDeviceUrl = (fallback: string): string => {
  const baked = process.env.REACT_APP_DEVICE_URL;
  return baked ? baked : fallback;
};
