import { createContext } from 'react';
import { SessionStore } from '../session';

/**
 * The injection seam for the live-session store. Deliberately defaults to
 * `null` — there is NO ambient store construction inside the package, so
 * {@link useSmokeSession} can throw a descriptive error when used outside a
 * {@link SmokeSessionProvider} instead of silently spinning up a second,
 * unstarted session.
 */
export const SmokeSessionContext = createContext<SessionStore | null>(null);
