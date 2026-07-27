/**
 * Renderer-URL resolution for the Electron main process.
 *
 * Kept here (rather than beside the main-process entry) so the smoker app's
 * jest suite — which only discovers tests under `src/` — actually runs and
 * covers it.
 */

/** What the shell has always loaded, and still loads with no override set. */
export const DEFAULT_RENDERER_URL = 'http://localhost:8080';

/**
 * The environment the resolution reads. The index signature keeps `process.env`
 * (`NodeJS.ProcessEnv`) assignable — without it TypeScript rejects the call as a
 * weak-type mismatch.
 */
export interface RendererUrlEnv {
  SMOKER_RENDERER_URL?: string;
  [key: string]: string | undefined;
}

export function resolveRendererUrl(env: RendererUrlEnv): string {
  // An exported-but-empty variable is what a launcher produces when its own
  // input was blank — that is "no override", not "load the empty string".
  const override = (env.SMOKER_RENDERER_URL ?? '').trim();
  return override === '' ? DEFAULT_RENDERER_URL : override;
}
