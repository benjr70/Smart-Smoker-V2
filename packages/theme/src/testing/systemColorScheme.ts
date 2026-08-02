/**
 * The operating system's colour preference, as a test can control it.
 *
 * jsdom has no media-query engine at all, so anything that asks the browser
 * whether the system is dark — the colour-scheme provider, the pre-paint script
 * — cannot run under test without one. This installs the smallest media-query
 * implementation those callers need, and hands back a switch so a test can
 * change the system preference while the page is open.
 */
export interface SystemColorScheme {
  /** Change the operating system's preference, notifying anything listening. */
  setDark(dark: boolean): void;
  /** Put back whatever `window.matchMedia` was before. */
  restore(): void;
}

type Listener = (event: { matches: boolean; media: string }) => void;

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Install a controllable `prefers-color-scheme` media query on `window`.
 *
 * @param dark whether the system starts out preferring dark.
 */
export const stubSystemColorScheme = (dark = false): SystemColorScheme => {
  const listenersByQuery = new Map<string, Set<Listener>>();
  let isDark = dark;

  const listenersFor = (query: string): Set<Listener> => {
    const existing = listenersByQuery.get(query);
    if (existing) {
      return existing;
    }
    const created = new Set<Listener>();
    listenersByQuery.set(query, created);
    return created;
  };

  const original = window.matchMedia;

  window.matchMedia = (query: string): MediaQueryList => {
    const listeners = listenersFor(query);
    const list = {
      media: query,
      get matches(): boolean {
        return query === DARK_QUERY ? isDark : false;
      },
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
      addListener: (listener: Listener) => listeners.add(listener),
      removeListener: (listener: Listener) => listeners.delete(listener),
      dispatchEvent: () => true,
    };
    return list as unknown as MediaQueryList;
  };

  return {
    setDark(next: boolean): void {
      isDark = next;
      listenersFor(DARK_QUERY).forEach(listener => listener({ matches: next, media: DARK_QUERY }));
    },
    restore(): void {
      window.matchMedia = original;
    },
  };
};
